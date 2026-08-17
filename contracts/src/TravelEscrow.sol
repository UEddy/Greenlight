// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title TravelEscrow
/// @notice Holds stablecoin for one trip until a visa outcome is known.
///
/// A traveler creates a trip, the traveler and any number of sponsors fund it,
/// a verifier attests whether the visa was granted, and the money either goes
/// to bookings or goes back to the people who put it in.
///
/// Four design decisions shape this contract.
///
/// 1. Decimal agnostic. Every amount is a raw token unit. The contract never
///    calls decimals() and never stores it. USDC on X Layer is likely 6 rather
///    than 18, and treating amounts as opaque removes the question. Display
///    scaling is the frontend's job.
///
/// 2. SafeERC20 for every token movement. X Layer USDT lives at
///    0x1E4a5963aBFD975d8c9021ce480b42188849D41d and tokens that return no
///    bool are common, so a bare transfer would silently fail or revert.
///
/// 3. Refunds are pull based. Nothing loops over sponsors. Each contributor
///    calls claimRefund and withdraws their own recorded stake. An unbounded
///    loop would be both a gas ceiling and a denial of service surface.
///
/// 4. Refunds are only reachable before a visa is granted. Once a trip reaches
///    VisaGranted the funds are committed to booking and there is no refund
///    path. That is what keeps the accounting simple: because nothing can ever
///    leave the escrow before VisaGranted, a refundable trip still holds one
///    hundred percent of what was put in, so each contributor's pro rata share
///    is exactly their own deposit. There is no partial release to reconcile.
///
/// travelBy is a settlement deadline, not a departure date. It is the moment
/// the escrow stops paying out and starts paying back, so it belongs after the
/// last payment the trip will make, not on the day the traveler flies.
///
/// Two things happen when that deadline passes, and which one depends on
/// whether a visa was ever attested.
///
/// With no outcome, the trip Expires and every contributor takes their full
/// deposit back, so an absent or failed verifier cannot strand anyone's money.
///
/// With a grant, the trip moves to Leftover and contributors share whatever
/// was never spent, in proportion to what they put in. Releases close at the
/// same moment, otherwise the traveler could race contributors for the
/// remainder. The pool is snapshotted on entry to Leftover so that claims do
/// not shrink the denominator under each other.
///
/// The verifier is a single trusted signer, fixed at deploy. That is honest
/// for a demo and not sufficient for production, which needs a consulate
/// issued attestation or a document verification provider. See the README.
contract TravelEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lifecycle of a trip.
    /// @dev Created and Funded are the pre outcome states. Once travelBy
    /// passes, a trip lands in one of two settled states depending on which
    /// side of the visa decision it was on:
    ///   pre outcome  -> Expired,  every contributor takes their full deposit
    ///   post outcome -> Leftover, contributors share whatever was not spent
    /// VisaDenied and Aborted are full refund states reached before travelBy.
    enum Status {
        None, // trip does not exist
        Created, // created, nothing contributed yet
        Funded, // at least one contribution received
        VisaGranted,
        VisaDenied,
        Booked,
        Completed,
        Aborted,
        Expired, // travel date passed with no outcome, full refunds
        Leftover // travel date passed after a grant, unspent remainder shared
    }

    struct Trip {
        address traveler;
        /// @dev Settlement deadline, not a departure date. See createTrip.
        uint64 travelBy;
        Status status;
        address token;
        uint256 target;
        uint256 totalContributed;
        uint256 totalReleased;
        uint256 totalRefunded;
        /// @dev Unspent remainder frozen at the moment the trip entered
        /// Leftover. Snapshotting matters: if shares were computed against a
        /// live balance, each claim would shrink the pool and every later
        /// claimant would be paid a smaller share of a smaller number. Zero
        /// outside the Leftover state.
        uint256 leftoverPool;
    }

    /// @notice Address allowed to attest visa outcomes. Fixed at deploy.
    address public immutable verifier;

    mapping(bytes32 tripId => Trip) private _trips;
    mapping(bytes32 tripId => mapping(address contributor => uint256 amount)) private _contributions;

    event TripCreated(
        bytes32 indexed tripId, address indexed traveler, address indexed token, uint256 target, uint64 travelBy
    );
    event Funded(bytes32 indexed tripId, address indexed traveler, uint256 amount, uint256 totalContributed);
    event Sponsored(bytes32 indexed tripId, address indexed sponsor, uint256 amount, uint256 totalContributed);
    event VisaAttested(bytes32 indexed tripId, bool granted);
    event Released(bytes32 indexed tripId, address indexed payee, uint256 amount, uint256 totalReleased);
    event Refunded(bytes32 indexed tripId, address indexed contributor, uint256 amount);
    event LeftoverOpened(bytes32 indexed tripId, uint256 pool, uint256 totalContributed);
    event LeftoverClaimed(bytes32 indexed tripId, address indexed contributor, uint256 amount);
    event TripAborted(bytes32 indexed tripId);
    event TripExpired(bytes32 indexed tripId);
    event TripCompleted(bytes32 indexed tripId);

    error TripAlreadyExists();
    error TripNotFound();
    error NotVerifier();
    error NotTraveler();
    error TravelDateInPast();
    error ZeroAddress();
    error ZeroAmount();
    error NothingReceived();
    error NotAcceptingFunds();
    error NotAwaitingOutcome();
    error NotReleasable();
    error NotRefundable();
    error NotBooked();
    error NothingToClaim();
    error AmountExceedsBalance();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotVerifier();
        _;
    }

    constructor(address verifier_) {
        if (verifier_ == address(0)) revert ZeroAddress();
        verifier = verifier_;
    }

    // ---------------------------------------------------------------------
    // Creation and funding
    // ---------------------------------------------------------------------

    /// @notice Open a trip. The caller becomes the traveler.
    /// @param target Funding goal in raw token units. Informational only, this
    /// contract does not enforce it, so a trip can be under or over funded.
    /// @param travelBy Settlement deadline in Unix seconds, not a departure
    /// date. This is the moment the escrow stops paying out and starts paying
    /// back: releases close, and contributors can claim. It therefore has to
    /// sit after the last payment the trip will ever make, and hotels commonly
    /// settle at checkout rather than at booking. Set it to the return date
    /// plus roughly a week. The frontend should prefill that and should not
    /// present this field as the date of travel.
    function createTrip(bytes32 tripId, address stablecoin, uint256 target, uint64 travelBy) external {
        if (_trips[tripId].status != Status.None) revert TripAlreadyExists();
        if (stablecoin == address(0)) revert ZeroAddress();
        if (travelBy <= block.timestamp) revert TravelDateInPast();

        Trip storage trip = _trips[tripId];
        trip.traveler = msg.sender;
        trip.travelBy = travelBy;
        trip.status = Status.Created;
        trip.token = stablecoin;
        trip.target = target;

        emit TripCreated(tripId, msg.sender, stablecoin, target, travelBy);
    }

    /// @notice Traveler adds their own money to the trip.
    function fund(bytes32 tripId, uint256 amount) external nonReentrant {
        Trip storage trip = _load(tripId);
        if (msg.sender != trip.traveler) revert NotTraveler();
        uint256 received = _contribute(tripId, trip, amount);
        emit Funded(tripId, msg.sender, received, trip.totalContributed);
    }

    /// @notice Anyone tops up a traveler's trip. An event organizer or a DAO
    /// covering someone's travel is the intended caller.
    function sponsor(bytes32 tripId, uint256 amount) external nonReentrant {
        Trip storage trip = _load(tripId);
        uint256 received = _contribute(tripId, trip, amount);
        emit Sponsored(tripId, msg.sender, received, trip.totalContributed);
    }

    /// @dev Shared accounting for fund and sponsor. Records the amount that
    /// actually arrived rather than the amount requested, so a fee on transfer
    /// token cannot make recorded stakes exceed the real balance. Follows
    /// checks, effects, interactions: the transfer happens first because the
    /// received amount is only knowable afterwards, and every state write that
    /// depends on it comes after, under nonReentrant.
    function _contribute(bytes32 tripId, Trip storage trip, uint256 amount) private returns (uint256 received) {
        if (trip.status != Status.Created && trip.status != Status.Funded) revert NotAcceptingFunds();
        if (block.timestamp >= trip.travelBy) revert NotAcceptingFunds();
        if (amount == 0) revert ZeroAmount();

        IERC20 token = IERC20(trip.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert NothingReceived();

        trip.status = Status.Funded;
        trip.totalContributed += received;
        _contributions[tripId][msg.sender] += received;
    }

    // ---------------------------------------------------------------------
    // Outcome
    // ---------------------------------------------------------------------

    /// @notice Verifier records whether the visa was granted.
    /// @dev Reverts once travelBy has passed. An expired trip belongs to its
    /// contributors, and a late attestation must not be able to take it back.
    function attestVisaOutcome(bytes32 tripId, bool granted) external onlyVerifier {
        Trip storage trip = _load(tripId);
        _settleIfDue(tripId, trip);
        if (trip.status != Status.Created && trip.status != Status.Funded) revert NotAwaitingOutcome();

        trip.status = granted ? Status.VisaGranted : Status.VisaDenied;
        emit VisaAttested(tripId, granted);
    }

    /// @notice Traveler cancels before an outcome is attested.
    function abort(bytes32 tripId) external {
        Trip storage trip = _load(tripId);
        if (msg.sender != trip.traveler) revert NotTraveler();
        if (trip.status != Status.Created && trip.status != Status.Funded) revert NotAwaitingOutcome();

        trip.status = Status.Aborted;
        emit TripAborted(tripId);
    }

    /// @notice Move a trip past its travel date into whichever settled state
    /// applies, Expired or Leftover. Permissionless, because the point of
    /// settlement is that it works when nobody else acts.
    /// @dev claimRefund applies the same transition on its own, so nobody has
    /// to call this first. It exists so the status readable on chain matches
    /// reality without waiting for the first claimer.
    function expire(bytes32 tripId) external {
        Trip storage trip = _load(tripId);
        _settleIfDue(tripId, trip);
        if (trip.status != Status.Expired && trip.status != Status.Leftover) revert NotRefundable();
    }

    /// @dev Lazy settlement. Solidity cannot transition on its own, so the
    /// check runs at the head of every path that cares.
    ///
    /// Which state a trip settles into depends on whether a visa was granted
    /// before the travel date passed. With no outcome, contributors get
    /// everything back. With a grant, the traveler had their chance to spend
    /// it and only the unspent remainder goes back.
    function _settleIfDue(bytes32 tripId, Trip storage trip) private {
        if (block.timestamp < trip.travelBy) return;

        Status status = trip.status;
        if (status == Status.Created || status == Status.Funded) {
            trip.status = Status.Expired;
            emit TripExpired(tripId);
            return;
        }

        // Completed is included deliberately. It is only a marker, and leaving
        // it out would let a traveler strand every contributor's remainder by
        // calling complete() before the travel date.
        if (status == Status.VisaGranted || status == Status.Booked || status == Status.Completed) {
            uint256 pool = trip.totalContributed - trip.totalReleased;
            trip.leftoverPool = pool;
            trip.status = Status.Leftover;
            emit LeftoverOpened(tripId, pool, trip.totalContributed);
        }
    }

    // ---------------------------------------------------------------------
    // Spending
    // ---------------------------------------------------------------------

    /// @notice Traveler pays a booking out of the escrow after a visa is
    /// granted. May be called more than once, for a flight and then a hotel.
    /// @dev Closes at travelBy. Past that point the unspent remainder belongs
    /// to the contributors, and the traveler must not be able to race them for
    /// it by releasing to an address they control.
    function releaseForBooking(bytes32 tripId, address payee, uint256 amount) external nonReentrant {
        Trip storage trip = _load(tripId);
        if (msg.sender != trip.traveler) revert NotTraveler();
        _settleIfDue(tripId, trip);
        if (trip.status != Status.VisaGranted && trip.status != Status.Booked) revert NotReleasable();
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > trip.totalContributed - trip.totalReleased) revert AmountExceedsBalance();

        trip.status = Status.Booked;
        trip.totalReleased += amount;

        emit Released(tripId, payee, amount, trip.totalReleased);
        IERC20(trip.token).safeTransfer(payee, amount);
    }

    /// @notice Traveler marks the trip finished. A marker for the event log,
    /// it moves no money.
    function complete(bytes32 tripId) external {
        Trip storage trip = _load(tripId);
        if (msg.sender != trip.traveler) revert NotTraveler();
        _settleIfDue(tripId, trip);
        if (trip.status != Status.Booked) revert NotBooked();

        trip.status = Status.Completed;
        emit TripCompleted(tripId);
    }

    // ---------------------------------------------------------------------
    // Refunds
    // ---------------------------------------------------------------------

    /// @notice Withdraw whatever this trip owes you. One entry point for both
    /// refund paths, because from a contributor's side it is the same action
    /// and the same claim ticket.
    ///
    /// Full refund, from VisaDenied, Aborted or Expired: no money can leave
    /// the escrow before a visa is granted, so a trip in one of these states
    /// still holds every contributed unit and each contributor takes back
    /// their whole deposit. That is what pro rata reduces to here.
    ///
    /// Pro rata leftover, from Leftover: the traveler got a visa and spent
    /// some of the escrow, then the travel date passed. Contributors share the
    /// unspent remainder in proportion to what they put in:
    ///     share = deposit * leftoverPool / totalContributed
    ///
    /// @dev Pull based on purpose. The caller's recorded stake is zeroed
    /// before the transfer, so a reentrant token cannot be paid twice, and
    /// nonReentrant closes the door regardless. The stake is zeroed in full
    /// even on the leftover path, where the payout is smaller: the difference
    /// is the portion that was already spent on bookings.
    function claimRefund(bytes32 tripId) external nonReentrant {
        Trip storage trip = _load(tripId);
        _settleIfDue(tripId, trip);

        uint256 deposit = _contributions[tripId][msg.sender];
        uint256 amount;
        bool isLeftover = trip.status == Status.Leftover;

        if (isLeftover) {
            if (deposit == 0) revert NothingToClaim();
            // mulDiv carries the full 512 bit intermediate, so a large
            // deposit times a large pool cannot overflow before dividing.
            // It floors, and the floored shares of a set of deposits summing
            // to totalContributed can never sum above leftoverPool, so the
            // escrow can never be asked for more than it holds.
            amount = Math.mulDiv(deposit, trip.leftoverPool, trip.totalContributed);
        } else {
            if (!_isRefundable(trip.status)) revert NotRefundable();
            amount = deposit;
        }

        if (amount == 0) revert NothingToClaim();

        _contributions[tripId][msg.sender] = 0;
        trip.totalRefunded += amount;

        if (isLeftover) {
            emit LeftoverClaimed(tripId, msg.sender, amount);
        } else {
            emit Refunded(tripId, msg.sender, amount);
        }
        IERC20(trip.token).safeTransfer(msg.sender, amount);
    }

    function _isRefundable(Status status) private pure returns (bool) {
        return status == Status.VisaDenied || status == Status.Aborted || status == Status.Expired;
    }

    /// @dev Status a trip would hold if settlement were applied right now.
    /// Every view uses this so a caller reading the contract before anyone has
    /// poked it still sees the truth.
    function _effectiveStatus(Trip storage trip) private view returns (Status) {
        if (block.timestamp < trip.travelBy) return trip.status;

        Status status = trip.status;
        if (status == Status.Created || status == Status.Funded) return Status.Expired;
        if (status == Status.VisaGranted || status == Status.Booked || status == Status.Completed) {
            return Status.Leftover;
        }
        return status;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getTrip(bytes32 tripId) external view returns (Trip memory) {
        return _trips[tripId];
    }

    function contributionOf(bytes32 tripId, address contributor) external view returns (uint256) {
        return _contributions[tripId][contributor];
    }

    /// @notice Status a trip would have if someone poked it now. Reports the
    /// settled state for a trip whose travel date has passed but whose stored
    /// status has not been written through yet.
    function statusOf(bytes32 tripId) external view returns (Status) {
        return _effectiveStatus(_trips[tripId]);
    }

    /// @notice Whether claimRefund would pay out for someone with a stake in
    /// this trip right now. Says nothing about any particular caller's
    /// balance, use claimableOf for that.
    function isRefundable(bytes32 tripId) external view returns (bool) {
        Trip storage trip = _trips[tripId];
        if (trip.status == Status.None) return false;
        Status status = _effectiveStatus(trip);
        return status == Status.Leftover || _isRefundable(status);
    }

    /// @notice What claimRefund would pay this contributor right now. Zero
    /// means the call would revert, either because the trip is not settled,
    /// because the caller never contributed, or because the pro rata share
    /// rounds to nothing.
    function claimableOf(bytes32 tripId, address contributor) external view returns (uint256) {
        Trip storage trip = _trips[tripId];
        if (trip.status == Status.None) return 0;

        uint256 deposit = _contributions[tripId][contributor];
        if (deposit == 0) return 0;

        Status status = _effectiveStatus(trip);
        if (status == Status.Leftover) {
            // The pool is only written to storage when settlement happens, so
            // recompute it here for a trip nobody has poked yet.
            uint256 pool = trip.status == Status.Leftover ? trip.leftoverPool : trip.totalContributed - trip.totalReleased;
            return Math.mulDiv(deposit, pool, trip.totalContributed);
        }
        return _isRefundable(status) ? deposit : 0;
    }

    /// @notice Units still held for this trip, released amounts removed.
    function escrowBalance(bytes32 tripId) external view returns (uint256) {
        Trip storage trip = _trips[tripId];
        return trip.totalContributed - trip.totalReleased - trip.totalRefunded;
    }

    function _load(bytes32 tripId) private view returns (Trip storage trip) {
        trip = _trips[tripId];
        if (trip.status == Status.None) revert TripNotFound();
    }
}
