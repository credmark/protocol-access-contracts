// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IRewardsPool {
    function issueRewards() external;

    function unissuedRewards(address recipient) external view returns (uint256);

    function increaseBalance(uint256 amount) external;

    function decreaseBalance(uint256 amount) external;
}
