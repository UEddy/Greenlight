// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IPayoutHook {
    function onEscrowPayout() external;
}

/// @notice A token that hands control to an attacker contract while the escrow
/// is paying out.
///
/// This is the realistic reentrancy vector for TravelEscrow. The only external
/// contract the escrow ever calls is the token named at trip creation, so a
/// hostile token is the attacker's way in. The token cannot impersonate a
/// contributor, so it calls back into a contract that is one, and that
/// contract re enters claimRefund under its own address.
contract ReentrantToken is ERC20 {
    address public escrow;
    address public hook;
    bool public armed;

    constructor() ERC20("Reentrant Token", "EVIL") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address escrow_, address hook_) external {
        escrow = escrow_;
        hook = hook_;
        armed = true;
    }

    /// @dev _update runs inside every transfer, so the callback fires while
    /// the escrow is mid payout, before its own call has returned.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (!armed) return;
        // Strike only on the way out of the escrow, never on deposits in.
        if (from != escrow) return;

        armed = false;
        IPayoutHook(hook).onEscrowPayout();
    }
}
