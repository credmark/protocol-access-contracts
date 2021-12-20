// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface ICredmarkAccessKey {
    // Configuration Functions
    function getFeesCount() external view returns (uint256);

    function setFee(uint256 feeAmount) external;

    function setLiquidatorReward(uint256 _liquidatorRewardBp) external;

    function setStakedCmkSweepShare(uint256 _stakedCmkSweepShareBp) external;

    function feesAccumulated(uint256 tokenId) external view returns (uint256 aggFees);

    function cmkValue(uint256 tokenId) external view returns (uint256);

    function mint(uint256 cmkAmount) external returns (uint256 tokenId);

    function addCmk(uint256 tokenId, uint256 cmkAmount) external;

    function burn(uint256 tokenId) external;

    function liquidate(uint256 tokenId) external;

    function sweep() external;
}
