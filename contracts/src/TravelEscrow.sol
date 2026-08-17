// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
/// Expiry closes the obvious hole in that design. If travelBy passes with no
/// outcome attested, the trip becomes refundable, so an absent or failed
/// verifier cannot strand anyone's money.
///
/// The verifier is a single trusted signer, fixed at deploy. That is honest
/// for a demo and not sufficient for production, which needs a consulate
/// issued attestation or a document verification provider. See the README.
contract TravelEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lifecycle of a trip.
    /// @dev Created and Funded are the two pre outcome states. VisaDenied,
    /// Aborted and Expired are the three refundable terminal states. Booked
    /// and Completed follow VisaGranted and are never refundable.
    enum Status {
        None, // trip does not exist
        Created, // created, nothing contributed yet
        Funded, // at least one contribution received
        VisaGranted,
        VisaDenied,
        Booked,
        Completed,
        Aborted,
        Expired
    }

    struct Trip {
        address traveler;
        uint64 travelBy;
        Status status;
        address token;
        uint256 target;
        uint256 totalContributed;
        uint256 totalReleased;
        uint256 totalRefunded;
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
    /// @param travelBy Unix seconds. Once reached with no outcome attested,
    /// the trip becomes refundable.
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
        _expireIfDue(tripId, trip);
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

    /// @notice Move a trip past its travel date into the refundable Expired
    /// state. Permissionless, because the point of expiry is that it works
    /// when the verifier does not.
    /// @dev claimRefund applies the same transition on its own, so nobody has
    /// to call this first. It exists so the status readable on chain matches
    /// reality without waiting for the first claimer.
    function expire(bytes32 tripId) external {
        Trip storage trip = _load(tripId);
        _expireIfDue(tripId, trip);
        if (trip.status != Status.Expired) revert NotRefundable();
    }

    /// @dev Lazy expiry. Solidity cannot transition on its own, so the check
    /// runs at the head of every path that cares.
    function _expireIfDue(bytes32 tripId, Trip storage trip) private {
        if ((trip.status == Status.Created || trip.status == Status.Funded) && block.timestamp >= trip.travelBy) {
            trip.status = Status.Expired;
            emit TripExpired(tripId);
        }
    }

    // ---------------------------------------------------------------------
    // Spending
    // ---------------------------------------------------------------------

    /// @notice Traveler pays a booking out of the escrow after a visa is
    /// granted. May be called more than once, for a flight and then a hotel.
    function releaseForBooking(bytes32 tripId, address payee, uint256 amount) external nonReentrant {
        Trip storage trip = _load(tripId);
        if (msg.sender != trip.traveler) revert NotTraveler();
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
        if (trip.status != Status.Booked) revert NotBooked();

        trip.status = Status.Completed;
        emit TripCompleted(tripId);
    }

    // ---------------------------------------------------------------------
    // Refunds
    // ---------------------------------------------------------------------

    /// @notice Withdraw your own stake from a refundable trip.
    /// @dev Pull based on purpose. The caller's recorded stake is zeroed
    /// before the transfer, so a reentrant token cannot be paid twice, and
    /// nonReentrant closes the door regardless.
    ///
    /// Because no money can leave the escrow before VisaGranted, and a
    /// refundable trip never reached VisaGranted, the escrow still holds every
    /// contributed unit. Each contributor's pro rata share is therefore their
    /// full deposit and no ratio arithmetic is needed.
    function claimRefund(bytes32 tripId) external nonReentrant {
        Trip storage trip = _load(tripId);
        _expireIfDue(tripId, trip);
        if (!_isRefundable(trip.status)) revert NotRefundable();

        uint256 amount = _contributions[tripId][msg.sender];
        if (amount == 0) revert NothingToClaim();

        _contributions[tripId][msg.sender] = 0;
        trip.totalRefunded += amount;

        emit Refunded(tripId, msg.sender, amount);
        IERC20(trip.token).safeTransfer(msg.sender, amount);
    }

    function _isRefundable(Status status) private pure returns (bool) {
        return status == Status.VisaDenied || status == Status.Aborted || status == Status.Expired;
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

    /// @notice Status a trip would have if someone poked it now. Reports
    /// Expired for a trip whose travel date has passed but whose stored status
    /// has not been updated yet.
    function statusOf(bytes32 tripId) external view returns (Status) {
        Trip storage trip = _trips[tripId];
        if ((trip.status == Status.Created || trip.status == Status.Funded) && block.timestamp >= trip.travelBy) {
            return Status.Expired;
        }
        return trip.status;
    }

    /// @notice Whether claimRefund would succeed for a contributor right now.
    function isRefundable(bytes32 tripId) external view returns (bool) {
        Trip storage trip = _trips[tripId];
        if (trip.status == Status.None) return false;
        if ((trip.status == Status.Created || trip.status == Status.Funded) && block.timestamp >= trip.travelBy) {
            return true;
        }
        return _isRefundable(trip.status);
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
