// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface ICredmarkMembershipTier {
    function snapshotFee() external;
    function snapshotRewards(uint256 rewardsPerSecond) external;

    function fees(uint256 tokenId) external view returns (uint256);
    function rewards(uint256 tokenId) external view returns (uint256);
    function deposits(uint256 tokenId) external view returns (uint256);
    function exit(uint256 tokenId) external returns(uint256 exitDeposit, uint256 exitReward, uint256 exitFee);
    function claim(uint256 tokenId) external returns (uint256 claimableRewards);
    function setFeeSeconds(uint256 newFeeSecondsUsd) external;
    function setPriceOracle(address newPriceOracle) external;
    function setLockupPeriod(uint256 newLockupPeriod) external;
    function setSubscribable(bool isSubscribable) external;
    function setRewardsPool(address newRewardsPool) external;

}
