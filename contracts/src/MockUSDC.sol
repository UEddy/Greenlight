// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Stand in for USDC on X Layer testnet. Six decimals on purpose: the
/// escrow must behave identically whatever this returns, and a token that is
/// not 18 decimals is the case most likely to expose an accidental assumption.
///
/// This lives in src rather than test because it gets deployed to a public
/// network. X Layer publishes no testnet stablecoin address, the contracts
/// page lists only WETH for testnet, so the demo needs its own.
///
/// Testnet only. mint is unrestricted and anyone can call it, which is the
/// point on a testnet and disqualifying anywhere else. On mainnet the escrow
/// points at the real USDC or USDT address from the X Layer docs.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
