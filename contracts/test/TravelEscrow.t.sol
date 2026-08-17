// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {TravelEscrow} from "../src/TravelEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {MockNoReturnToken} from "./mocks/MockNoReturnToken.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {ReentrantSponsor} from "./mocks/ReentrantSponsor.sol";

contract TravelEscrowTest is Test {
    TravelEscrow internal escrow;
    MockUSDC internal usdc;

    address internal verifier = makeAddr("verifier");
    address internal traveler = makeAddr("traveler");
    address internal sponsorA = makeAddr("sponsorA");
    address internal sponsorB = makeAddr("sponsorB");
    address internal airline = makeAddr("airline");
    address internal stranger = makeAddr("stranger");

    bytes32 internal constant TRIP = keccak256("trip-lagos-to-lisbon");

    // Six decimal amounts. 1_000e6 is one thousand USDC, not one thousand wei.
    uint256 internal constant TARGET = 2_000e6;
    uint64 internal travelBy;

    function setUp() public {
        // Start at a realistic timestamp so travelBy arithmetic is not near zero.
        vm.warp(1_755_000_000);
        travelBy = uint64(block.timestamp + 30 days);

        escrow = new TravelEscrow(verifier);
        usdc = new MockUSDC();

        usdc.mint(traveler, 10_000e6);
        usdc.mint(sponsorA, 10_000e6);
        usdc.mint(sponsorB, 10_000e6);

        vm.prank(traveler);
        escrow.createTrip(TRIP, address(usdc), TARGET, travelBy);
    }

    // -----------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------

    function _fund(address who, uint256 amount) internal {
        vm.startPrank(who);
        usdc.approve(address(escrow), amount);
        if (who == traveler) {
            escrow.fund(TRIP, amount);
        } else {
            escrow.sponsor(TRIP, amount);
        }
        vm.stopPrank();
    }

    function _attest(bool granted) internal {
        vm.prank(verifier);
        escrow.attestVisaOutcome(TRIP, granted);
    }

    // -----------------------------------------------------------------
    // creation
    // -----------------------------------------------------------------

    function test_createTrip_setsInitialState() public view {
        TravelEscrow.Trip memory trip = escrow.getTrip(TRIP);
        assertEq(trip.traveler, traveler);
        assertEq(trip.token, address(usdc));
        assertEq(trip.target, TARGET);
        assertEq(trip.travelBy, travelBy);
        assertEq(uint8(trip.status), uint8(TravelEscrow.Status.Created));
        assertEq(trip.totalContributed, 0);
        assertEq(escrow.verifier(), verifier);
    }

    function test_createTrip_revertsOnDuplicateId() public {
        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.TripAlreadyExists.selector);
        escrow.createTrip(TRIP, address(usdc), TARGET, travelBy);
    }

    function test_createTrip_revertsOnPastTravelDate() public {
        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.TravelDateInPast.selector);
        escrow.createTrip(keccak256("past"), address(usdc), TARGET, uint64(block.timestamp));
    }

    function test_unknownTripReverts() public {
        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.TripNotFound.selector);
        escrow.fund(keccak256("nope"), 1e6);
    }

    // -----------------------------------------------------------------
    // 1. happy path
    // -----------------------------------------------------------------

    function test_happyPath_fundSponsorGrantReleaseComplete() public {
        _fund(traveler, 1_200e6);
        _fund(sponsorA, 800e6);

        TravelEscrow.Trip memory trip = escrow.getTrip(TRIP);
        assertEq(uint8(trip.status), uint8(TravelEscrow.Status.Funded));
        assertEq(trip.totalContributed, 2_000e6);
        assertEq(escrow.contributionOf(TRIP, traveler), 1_200e6);
        assertEq(escrow.contributionOf(TRIP, sponsorA), 800e6);
        assertEq(usdc.balanceOf(address(escrow)), 2_000e6);

        _attest(true);
        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.VisaGranted));
        assertFalse(escrow.isRefundable(TRIP));

        // Two releases, a flight and then a hotel.
        vm.startPrank(traveler);
        escrow.releaseForBooking(TRIP, airline, 900e6);
        escrow.releaseForBooking(TRIP, airline, 600e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(airline), 1_500e6);
        assertEq(escrow.escrowBalance(TRIP), 500e6);
        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.Booked));

        vm.prank(traveler);
        escrow.complete(TRIP);
        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.Completed));
    }

    function test_release_revertsAboveEscrowBalance() public {
        _fund(traveler, 1_000e6);
        _attest(true);

        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.AmountExceedsBalance.selector);
        escrow.releaseForBooking(TRIP, airline, 1_000e6 + 1);
    }

    function test_release_onlyTraveler() public {
        _fund(traveler, 1_000e6);
        _attest(true);

        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NotTraveler.selector);
        escrow.releaseForBooking(TRIP, airline, 100e6);
    }

    function test_attest_onlyVerifier() public {
        _fund(traveler, 1_000e6);

        vm.prank(stranger);
        vm.expectRevert(TravelEscrow.NotVerifier.selector);
        escrow.attestVisaOutcome(TRIP, true);
    }

    // -----------------------------------------------------------------
    // 2. denial and pull refund
    // -----------------------------------------------------------------

    function test_denial_eachContributorPullsOwnStake() public {
        _fund(traveler, 1_200e6);
        _fund(sponsorA, 500e6);
        _fund(sponsorB, 300e6);

        _attest(false);
        assertTrue(escrow.isRefundable(TRIP));

        uint256 travelerBefore = usdc.balanceOf(traveler);
        uint256 sponsorABefore = usdc.balanceOf(sponsorA);
        uint256 sponsorBBefore = usdc.balanceOf(sponsorB);

        vm.prank(traveler);
        escrow.claimRefund(TRIP);
        vm.prank(sponsorA);
        escrow.claimRefund(TRIP);
        vm.prank(sponsorB);
        escrow.claimRefund(TRIP);

        // Nothing left the escrow before the denial, so every stake comes back
        // whole. That is what pro rata reduces to under decision 4.
        assertEq(usdc.balanceOf(traveler) - travelerBefore, 1_200e6);
        assertEq(usdc.balanceOf(sponsorA) - sponsorABefore, 500e6);
        assertEq(usdc.balanceOf(sponsorB) - sponsorBBefore, 300e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        assertEq(escrow.escrowBalance(TRIP), 0);
    }

    function test_denial_releaseIsClosed() public {
        _fund(traveler, 1_000e6);
        _attest(false);

        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.NotReleasable.selector);
        escrow.releaseForBooking(TRIP, airline, 100e6);
    }

    function test_grant_refundIsClosed() public {
        _fund(traveler, 1_000e6);
        _fund(sponsorA, 500e6);
        _attest(true);

        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NotRefundable.selector);
        escrow.claimRefund(TRIP);
    }

    function test_nonContributorCannotClaim() public {
        _fund(traveler, 1_000e6);
        _attest(false);

        vm.prank(stranger);
        vm.expectRevert(TravelEscrow.NothingToClaim.selector);
        escrow.claimRefund(TRIP);
    }

    // -----------------------------------------------------------------
    // 3. expiry refund
    // -----------------------------------------------------------------

    function test_expiry_refundableWhenVerifierNeverShows() public {
        _fund(traveler, 1_000e6);
        _fund(sponsorA, 400e6);

        assertFalse(escrow.isRefundable(TRIP));

        vm.warp(travelBy);

        // No one has poked the contract, but the view already tells the truth.
        assertTrue(escrow.isRefundable(TRIP));
        assertEq(uint8(escrow.statusOf(TRIP)), uint8(TravelEscrow.Status.Expired));

        uint256 before = usdc.balanceOf(sponsorA);
        vm.prank(sponsorA);
        escrow.claimRefund(TRIP);
        assertEq(usdc.balanceOf(sponsorA) - before, 400e6);

        // The first claim wrote the state through for everyone else.
        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.Expired));

        vm.prank(traveler);
        escrow.claimRefund(TRIP);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_expiry_permissionlessExpireCall() public {
        _fund(traveler, 1_000e6);
        vm.warp(travelBy + 1);

        vm.prank(stranger);
        escrow.expire(TRIP);
        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.Expired));
    }

    function test_expiry_revertsBeforeTravelDate() public {
        _fund(traveler, 1_000e6);

        vm.expectRevert(TravelEscrow.NotRefundable.selector);
        escrow.expire(TRIP);
    }

    function test_expiry_lateAttestationCannotTakeBackFunds() public {
        _fund(traveler, 1_000e6);
        vm.warp(travelBy);

        // The verifier turns up after the travel date. The money is already
        // the contributors' and must stay that way.
        vm.prank(verifier);
        vm.expectRevert(TravelEscrow.NotAwaitingOutcome.selector);
        escrow.attestVisaOutcome(TRIP, true);

        assertTrue(escrow.isRefundable(TRIP));
    }

    function test_expiry_fundingClosesAtTravelDate() public {
        vm.warp(travelBy);

        vm.startPrank(sponsorA);
        usdc.approve(address(escrow), 100e6);
        vm.expectRevert(TravelEscrow.NotAcceptingFunds.selector);
        escrow.sponsor(TRIP, 100e6);
        vm.stopPrank();
    }

    function test_grantedTripDoesNotExpire() public {
        _fund(traveler, 1_000e6);
        _attest(true);

        vm.warp(travelBy + 365 days);

        assertFalse(escrow.isRefundable(TRIP));
        assertEq(uint8(escrow.statusOf(TRIP)), uint8(TravelEscrow.Status.VisaGranted));

        // Booking can still be paid after the travel date once a visa exists.
        vm.prank(traveler);
        escrow.releaseForBooking(TRIP, airline, 1_000e6);
        assertEq(usdc.balanceOf(airline), 1_000e6);
    }

    // -----------------------------------------------------------------
    // 4. abort before funding
    // -----------------------------------------------------------------

    function test_abort_beforeAnyFunding() public {
        vm.prank(traveler);
        escrow.abort(TRIP);

        assertEq(uint8(escrow.getTrip(TRIP).status), uint8(TravelEscrow.Status.Aborted));
        assertTrue(escrow.isRefundable(TRIP));

        // Refundable, but there is nothing to give back.
        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.NothingToClaim.selector);
        escrow.claimRefund(TRIP);

        // And an aborted trip takes no more money.
        vm.startPrank(sponsorA);
        usdc.approve(address(escrow), 100e6);
        vm.expectRevert(TravelEscrow.NotAcceptingFunds.selector);
        escrow.sponsor(TRIP, 100e6);
        vm.stopPrank();
    }

    function test_abort_afterFundingRefundsEveryone() public {
        _fund(traveler, 600e6);
        _fund(sponsorA, 400e6);

        vm.prank(traveler);
        escrow.abort(TRIP);

        vm.prank(sponsorA);
        escrow.claimRefund(TRIP);
        vm.prank(traveler);
        escrow.claimRefund(TRIP);

        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_abort_onlyTraveler() public {
        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NotTraveler.selector);
        escrow.abort(TRIP);
    }

    function test_abort_notAfterVisaGranted() public {
        _fund(traveler, 1_000e6);
        _attest(true);

        vm.prank(traveler);
        vm.expectRevert(TravelEscrow.NotAwaitingOutcome.selector);
        escrow.abort(TRIP);
    }

    // -----------------------------------------------------------------
    // 5. double claim
    // -----------------------------------------------------------------

    function test_doubleClaim_secondCallReverts() public {
        _fund(traveler, 1_000e6);
        _fund(sponsorA, 500e6);
        _attest(false);

        vm.prank(sponsorA);
        escrow.claimRefund(TRIP);
        assertEq(escrow.contributionOf(TRIP, sponsorA), 0);

        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NothingToClaim.selector);
        escrow.claimRefund(TRIP);

        // One claimant draining does not touch anyone else's stake.
        assertEq(escrow.contributionOf(TRIP, traveler), 1_000e6);
        assertEq(usdc.balanceOf(address(escrow)), 1_000e6);
    }

    function test_doubleClaim_acrossExpireAndDenial() public {
        _fund(sponsorA, 500e6);
        _attest(false);

        vm.prank(sponsorA);
        escrow.claimRefund(TRIP);

        // Warping past the travel date must not reopen a spent claim.
        vm.warp(travelBy + 1);
        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NothingToClaim.selector);
        escrow.claimRefund(TRIP);
    }

    // -----------------------------------------------------------------
    // 6. reentrancy attempt
    // -----------------------------------------------------------------

    function test_reentrancy_claimRefundCannotBeDrained() public {
        ReentrantToken evil = new ReentrantToken();
        bytes32 tripId = keccak256("evil-trip");

        vm.prank(traveler);
        escrow.createTrip(tripId, address(evil), TARGET, travelBy);

        ReentrantSponsor attacker = new ReentrantSponsor(escrow, IERC20(address(evil)));
        evil.mint(address(attacker), 500e6);
        evil.mint(sponsorB, 700e6);

        attacker.arm(tripId);
        attacker.contribute(tripId, 500e6);

        vm.startPrank(sponsorB);
        evil.approve(address(escrow), 700e6);
        escrow.sponsor(tripId, 700e6);
        vm.stopPrank();

        vm.prank(verifier);
        escrow.attestVisaOutcome(tripId, false);

        // Arm the token to call back into the attacker mid payout.
        evil.arm(address(escrow), address(attacker));

        attacker.claim(tripId);

        assertTrue(attacker.reenterAttempted(), "attack never fired, test proves nothing");
        assertFalse(attacker.reenterSucceeded(), "reentrant claim succeeded");

        // Paid exactly once, and the other sponsor's money is untouched.
        assertEq(evil.balanceOf(address(attacker)), 500e6);
        assertEq(evil.balanceOf(address(escrow)), 700e6);
        assertEq(escrow.contributionOf(tripId, address(attacker)), 0);
        assertEq(escrow.contributionOf(tripId, sponsorB), 700e6);

        // And the honest sponsor can still be paid in full afterwards.
        vm.prank(sponsorB);
        escrow.claimRefund(tripId);
        assertEq(evil.balanceOf(sponsorB), 700e6);
        assertEq(evil.balanceOf(address(escrow)), 0);
    }

    // -----------------------------------------------------------------
    // 7. non standard ERC20, the reason SafeERC20 is used
    // -----------------------------------------------------------------

    function test_usdtStyleTokenWithNoReturnValueWorks() public {
        MockNoReturnToken usdt = new MockNoReturnToken();
        bytes32 tripId = keccak256("usdt-trip");

        vm.prank(traveler);
        escrow.createTrip(tripId, address(usdt), TARGET, travelBy);

        usdt.mint(sponsorA, 1_000e6);

        vm.startPrank(sponsorA);
        usdt.approve(address(escrow), 1_000e6);
        escrow.sponsor(tripId, 1_000e6);
        vm.stopPrank();

        assertEq(usdt.balanceOf(address(escrow)), 1_000e6);

        vm.prank(verifier);
        escrow.attestVisaOutcome(tripId, false);

        vm.prank(sponsorA);
        escrow.claimRefund(tripId);
        assertEq(usdt.balanceOf(sponsorA), 1_000e6);
    }

    // -----------------------------------------------------------------
    // 8. fuzz the contributor accounting
    // -----------------------------------------------------------------

    /// @notice The core money invariant: whatever the contributions look like,
    /// the sum of what everyone claims back can never exceed the sum of what
    /// they put in, and the escrow is never left owing more than it holds.
    function testFuzz_sumOfClaimsNeverExceedsSumOfDeposits(
        uint96 amountA,
        uint96 amountB,
        uint96 amountC,
        bool abortInsteadOfDeny,
        uint8 claimOrder
    ) public {
        amountA = uint96(bound(amountA, 1, 1_000_000e6));
        amountB = uint96(bound(amountB, 1, 1_000_000e6));
        amountC = uint96(bound(amountC, 1, 1_000_000e6));

        bytes32 tripId = keccak256(abi.encode("fuzz", amountA, amountB, amountC));
        vm.prank(traveler);
        escrow.createTrip(tripId, address(usdc), TARGET, travelBy);

        address[3] memory who = [traveler, sponsorA, sponsorB];
        uint96[3] memory amounts = [amountA, amountB, amountC];

        uint256 totalDeposited;
        for (uint256 i = 0; i < 3; i++) {
            usdc.mint(who[i], amounts[i]);
            vm.startPrank(who[i]);
            usdc.approve(address(escrow), amounts[i]);
            if (who[i] == traveler) {
                escrow.fund(tripId, amounts[i]);
            } else {
                escrow.sponsor(tripId, amounts[i]);
            }
            vm.stopPrank();
            totalDeposited += amounts[i];
        }

        assertEq(escrow.getTrip(tripId).totalContributed, totalDeposited);
        assertEq(usdc.balanceOf(address(escrow)), totalDeposited);

        if (abortInsteadOfDeny) {
            vm.prank(traveler);
            escrow.abort(tripId);
        } else {
            vm.prank(verifier);
            escrow.attestVisaOutcome(tripId, false);
        }

        // Claim in a fuzzed order, and let each party try twice.
        uint256 totalClaimed;
        for (uint256 round = 0; round < 2; round++) {
            for (uint256 i = 0; i < 3; i++) {
                address claimant = who[(i + claimOrder) % 3];
                uint256 before = usdc.balanceOf(claimant);
                vm.prank(claimant);
                try escrow.claimRefund(tripId) {
                    totalClaimed += usdc.balanceOf(claimant) - before;
                } catch {
                    // A second claim must fail. That is the point.
                }
            }
        }

        assertEq(totalClaimed, totalDeposited, "claims must equal deposits exactly");
        assertLe(totalClaimed, totalDeposited, "claims must never exceed deposits");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow must be empty");
        assertEq(escrow.escrowBalance(tripId), 0);

        for (uint256 i = 0; i < 3; i++) {
            assertEq(escrow.contributionOf(tripId, who[i]), 0);
        }
    }

    /// @notice Same invariant on the granted branch: once money is released
    /// for booking, nobody can claim any of it back.
    function testFuzz_grantedTripNeverRefunds(uint96 deposit, uint96 release) public {
        deposit = uint96(bound(deposit, 1, 1_000_000e6));
        release = uint96(bound(release, 1, deposit));

        bytes32 tripId = keccak256(abi.encode("fuzz-granted", deposit, release));
        vm.prank(traveler);
        escrow.createTrip(tripId, address(usdc), TARGET, travelBy);

        usdc.mint(sponsorA, deposit);
        vm.startPrank(sponsorA);
        usdc.approve(address(escrow), deposit);
        escrow.sponsor(tripId, deposit);
        vm.stopPrank();

        vm.prank(verifier);
        escrow.attestVisaOutcome(tripId, true);

        vm.prank(traveler);
        escrow.releaseForBooking(tripId, airline, release);

        vm.prank(sponsorA);
        vm.expectRevert(TravelEscrow.NotRefundable.selector);
        escrow.claimRefund(tripId);

        assertEq(usdc.balanceOf(airline), release);
        assertEq(escrow.escrowBalance(tripId), deposit - release);
    }
}
