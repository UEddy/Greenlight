// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TravelEscrow} from "../../src/TravelEscrow.sol";

/// @notice A sponsor that tries to be refunded twice for one deposit.
///
/// It contributes normally, then calls claimRefund. The hostile token calls
/// onEscrowPayout while the escrow is still inside that first claim, and this
/// contract uses that window to call claimRefund again. Both defenses in the
/// escrow should stop it: the stake is zeroed before the transfer, and
/// nonReentrant rejects the second entry outright.
contract ReentrantSponsor {
    TravelEscrow public immutable escrow;
    IERC20 public immutable token;

    bool public reenterAttempted;
    bool public reenterSucceeded;

    constructor(TravelEscrow escrow_, IERC20 token_) {
        escrow = escrow_;
        token = token_;
    }

    function contribute(bytes32 tripId, uint256 amount) external {
        token.approve(address(escrow), amount);
        escrow.sponsor(tripId, amount);
    }

    function claim(bytes32 tripId) external {
        escrow.claimRefund(tripId);
    }

    /// @dev Called by ReentrantToken from inside the escrow's payout transfer.
    function onEscrowPayout() external {
        reenterAttempted = true;
        // The trip id is recoverable from storage in a real attack. Reading it
        // back from the escrow is not needed here because the test arms this
        // contract for exactly one trip.
        try escrow.claimRefund(_tripId) {
            reenterSucceeded = true;
        } catch {
            reenterSucceeded = false;
        }
    }

    bytes32 private _tripId;

    function arm(bytes32 tripId) external {
        _tripId = tripId;
    }
}
