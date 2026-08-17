// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TravelEscrow} from "../src/TravelEscrow.sol";

/// @notice Deploys the demo stack to X Layer testnet, chain id 1952.
///
/// MockUSDC goes out first because X Layer publishes no testnet stablecoin
/// address. The contracts page lists testnet addresses only for WETH, and a
/// dash for USDC, USDT and every other stablecoin, so the demo has to bring
/// its own six decimal token.
///
/// Run it with:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url https://testrpc.xlayer.tech/terigon \
///     --account greenlight-deployer \
///     --broadcast
///
/// VERIFIER_ADDRESS is optional. Left unset, the deployer becomes the
/// verifier, which is the honest demo setup described in the README.
contract Deploy is Script {
    /// @dev Seed balance minted to the deployer so a demo trip can be funded
    /// straight away. One million units at six decimals.
    uint256 internal constant SEED_MINT = 1_000_000e6;

    function run() external {
        address deployer = msg.sender;
        address verifier = vm.envOr("VERIFIER_ADDRESS", deployer);

        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        TravelEscrow escrow = new TravelEscrow(verifier);
        usdc.mint(deployer, SEED_MINT);

        vm.stopBroadcast();

        console.log("chain id       ", block.chainid);
        console.log("deployer       ", deployer);
        console.log("verifier       ", verifier);
        console.log("MockUSDC       ", address(usdc));
        console.log("TravelEscrow   ", address(escrow));
        console.log("seed minted    ", SEED_MINT);
    }
}
