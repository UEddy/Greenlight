// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A token in the shape of USDT: transfer and transferFrom return
/// nothing at all rather than a bool.
///
/// This is why the escrow uses SafeERC20. A direct IERC20(token).transfer call
/// against this contract reverts on ABI decoding, because the compiler expects
/// 32 bytes of return data and gets zero. X Layer USDT at
/// 0x1E4a5963aBFD975d8c9021ce480b42188849D41d is this shape, so the escrow has
/// to handle it.
contract MockNoReturnToken {
    string public name = "Mock Tether";
    string public symbol = "USDT";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    // Deliberately no return value.
    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    // Deliberately no return value.
    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount, "balance");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
