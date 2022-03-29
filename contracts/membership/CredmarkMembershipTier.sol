// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IRewardsPool.sol";
import "./ICredmarkMembershipTier.sol";

contract CredmarkMembershipTier is AccessControl, ICredmarkMembershipTier {
    using SafeERC20 for IERC20;
    struct Cursor {
        uint256 snapshot;
        uint256 timestamp;
        uint256 rate;
    }

    struct MembershipState {
        uint256 deposited;
        uint256 unclaimedSnapshot;
        uint256 feeCursorSnapshot;
        uint256 rewardCursorSnapshot;
    }

    struct MembershipTierConfiguration {
        uint256 multiplier;
        uint256 lockupSeconds;
        uint256 feePerSecondUsd;
        bool subscribable;
        IPriceOracle oracle;
        IRewardsPool rewardsPool;
        IERC20 baseToken;
        IERC20 feeReferenceToken;
    }

    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");
    
    MembershipTierConfiguration public config;

    Cursor private _feeCursor;
    Cursor private _rewardCursor;

    uint256 public totalDeposits;

    mapping(uint256 => MembershipState) private _memberships;

    event Deposited(uint256 tokenId, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event Removed(address indexed user, uint256 amount);
    event FeeCursorUpdated(Cursor cursor);
    event RewardCursorUpdated(Cursor cursor);

    constructor(
        MembershipTierConfiguration memory configuration
    ) {
        _grantRole(TIER_MANAGER, msg.sender);
        config = configuration;
    }

    function snapshotFee() public override onlyRole(TIER_MANAGER) {
        /*
            happens when oracle changes
        */

        require(address(config.oracle) != address(0), "Oracle not set");

        uint256 price = config.oracle.getPrice();
        uint256 decimals = config.oracle.decimals();

        require(price != 0, "CMK price is reported 0");

        _feeCursor.snapshot = _globalFee();
        _feeCursor.timestamp = block.timestamp;
        _feeCursor.rate = config.feePerSecondUsd * 10**decimals / price;

        emit FeeCursorUpdated(_feeCursor);
    }

    function snapshotRewards(uint256 rewardsPerSecond) external override onlyRole(TIER_MANAGER) {

        /*
            NOTE:
            Should happen on every parent deposit or subscription.

            rewardsPerSecond should be RewardsPool.rewardsPerSecond / sum(totalDeposit * multiplier) for all CredmarkMembershipTiers
        */

        _rewardCursor.snapshot = _globalRewards();
        _rewardCursor.timestamp = block.timestamp;
        _rewardCursor.rate = rewardsPerSecond;

        emit RewardCursorUpdated(_rewardCursor);
    }

    function _globalFee() private view returns (uint256) {
        return (block.timestamp - _feeCursor.timestamp) * _feeCursor.rate + _feeCursor.snapshot;
    }

    function _globalRewards() private view returns (uint256) {
        return (block.timestamp - _rewardCursor.timestamp) * _rewardCursor.rate + _rewardCursor.snapshot;
    }

    function fees(uint256 tokenId) public override view returns (uint256) {
        return _globalFee() - _memberships[tokenId].feeCursorSnapshot;
    }

    function rewards(uint256 tokenId) public override view returns (uint256) {

        // THIS WILL HAVE UNDERFLOW ISSUES, totaldeposited / my deposits will always be < 0
        return (_globalRewards() - _memberships[tokenId].rewardCursorSnapshot) * totalDeposits / deposits(tokenId) + _memberships[tokenId].unclaimedSnapshot; 
    }

    function deposits(uint256 tokenId) public override view returns (uint256) {
        return _memberships[tokenId].deposited;
    }

    function deposit(uint256 tokenId, uint256 amount) external onlyRole(TIER_MANAGER) {

        totalDeposits += amount;
        _memberships[tokenId].deposited += amount;
        _memberships[tokenId].unclaimedSnapshot = rewards(tokenId);
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();

        emit Deposited(tokenId, amount);
    }

    function claim(uint256 tokenId) external override onlyRole(TIER_MANAGER) returns (uint256 claimableRewards) {
        claimableRewards = rewards(tokenId);
        _memberships[tokenId].unclaimedSnapshot = 0;
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();
    }

    function exit(uint256 tokenId) external override onlyRole(TIER_MANAGER) returns(uint256 exitDeposits, uint256 exitRewards, uint256 exitFees) {
        exitDeposits = deposits(tokenId);
        exitRewards = rewards(tokenId);
        exitFees = fees(tokenId);
        totalDeposits -= _memberships[tokenId].deposited;

        delete _memberships[tokenId];
    }

    function setFeeSeconds(uint256 newFeeSecondsUsd) external override onlyRole(TIER_MANAGER) {
        config.feePerSecondUsd = newFeeSecondsUsd;
        snapshotFee();
    }

    function setPriceOracle(address newPriceOracle) external override onlyRole(TIER_MANAGER) {
        config.oracle = IPriceOracle(newPriceOracle);
    }

    function setLockupPeriod(uint256 newLockupPeriod) external override onlyRole(TIER_MANAGER) {
        config.lockupSeconds = newLockupPeriod;
    }

    function setSubscribable(bool isSubscribable) external override onlyRole(TIER_MANAGER) {
        config.subscribable = isSubscribable;
    }

    function setRewardsPool(address newRewardsPool) external override onlyRole(TIER_MANAGER) {
        config.rewardsPool = IRewardsPool(newRewardsPool);
    }
}
