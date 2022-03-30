// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./ICredmarkMembershipTier.sol";
import "./CredmarkMembershipRegistry.sol";

contract CredmarkMembershipTier is AccessControl, ICredmarkMembershipTier {
    using SafeERC20 for IERC20;

    struct Cursor {
        uint256 snapshot;
        uint256 timestamp;
        uint256 rate;
    }

    struct MembershipState {
        uint256 deposited;
        uint256 unclaimedRewards;
        uint256 feeCursorSnapshot;
        uint256 rewardCursorSnapshot;
    }

    struct MembershipTierConfiguration {
        uint256 multiplier;
        uint256 lockupSeconds;
        uint256 feePerSecond;
        bool subscribable;
        IERC20 baseToken;
        IERC20 feeToken;
    }

    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");
    
    MembershipTierConfiguration public config;

    Cursor private _feeCursor;

    uint256 public totalDeposits;
    CredmarkMembershipRegistry registry;

    mapping(uint256 => MembershipState) private _memberships;

    event Deposited(uint256 tokenId, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event Exited(uint256 tokenId);

    constructor(
        MembershipTierConfiguration memory configuration, 
        CredmarkMembershipRegistry _registry) {
        require(address(_registry.membership) != address(0));

        _grantRole(TIER_MANAGER, _registry.membership);

        SafeERC20.safeApprove(configuration.baseToken, _registry.membership, configuration.baseToken.totalSupply());
        config = configuration;
        registry = _registry;
    }

    function fees(uint256 tokenId) public override view returns (uint256) {
        return _globalFee() - _memberships[tokenId].feeCursorSnapshot;
    }

    function deposits(uint256 tokenId) public override view returns (uint256) {
        return _memberships[tokenId].deposited;
    }

    function rewards(uint256 tokenId) public view returns (uint256) {
        return (_globalRewards() - _memberships[tokenId].rewardCursorSnapshot) * 
            (totalDeposits / deposits(tokenId)) + _memberships[tokenId].unclaimedRewards; 
    }

    function rewardsToBaseValue(uint256 amount) public override view returns (uint256) {
        IPriceOracle baseOracle = registry.oracles[config.baseToken];
        IPriceOracle feeOracle = registry.oracles[config.feeToken];

        return amount * baseOracle.getPrice() * (10**rewardsOracle.decimals()) / 
            (rewardsOracle.getPrice() * (10**baseOracle.decimals()));
    }

    function _globalFee() internal view returns (uint256) {
        return (block.timestamp - _feeCursor.timestamp) * _feeCursor.rate + _feeCursor.snapshot;
    }

    function _globalRewards() internal view returns (uint256) {
        return registry.globalTierRewards(address(this));
    }

    function deposit(uint256 tokenId, uint256 amount) external onlyRole(TIER_MANAGER) {

        totalDeposits += amount;
        _memberships[tokenId].deposited += amount;
        _memberships[tokenId].unclaimedRewards = rewards(tokenId);
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();

        if (_memberships[tokenId].subscribedAtTimestamp == 0) {
            _memberships[tokenId].subscribedAtTimestamp = block.timestamp;
        }

        emit Deposited(tokenId, amount);
    }

    function claim(uint256 tokenId, uint256 amount) external override onlyRole(TIER_MANAGER) returns (uint256 claimableRewards) {
        claimableRewards = rewards(tokenId);
        _memberships[tokenId].unclaimedRewards = claimableRewards - amount;
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();

        emit Claimed(tokenId, claimableRewards);
    }

    function exit(uint256 tokenId) external override onlyRole(TIER_MANAGER) returns(uint256 exitDeposits, uint256 exitRewards, uint256 exitFees) {

        exitDeposits = deposits(tokenId);
        exitRewards = rewards(tokenId);
        exitFees = fees(tokenId);
        exitRewardsValue = rewardsValue(tokenId);

        totalDeposits -= _memberships[tokenId].deposited;

        delete _memberships[tokenId];

        Exited(tokenId);
    }

    function snapshotFee() public override {

        require(address(registry.oracles[config.baseToken]) != address(0), "BaseToken Oracle not set");
        require(address(registry.oracles[config.feeToken]) != address(0), "FeeToken Oracle not set");    

        IPriceOracle baseOracle = registry.oracles[config.baseToken];
        IPriceOracle feeOracle = registry.oracles[config.feeToken];

        _feeCursor.snapshot = _globalFee();
        _feeCursor.timestamp = block.timestamp;
        _feeCursor.rate = config.feePerSecond * feeOracle.getPrice() * (10**baseOracle.decimals()) / 
            (baseOracle.getPrice() * (10**feeOracle.decimals()));

        emit FeeCursorUpdated(_feeCursor);
    }

    function setFeeSeconds(uint256 newFeeSecondsUsd) external override onlyRole(TIER_MANAGER) {
        config.feePerSecond = newFeeSecondsUsd;
        snapshotFee();
    }

    function setLockupSeconds(uint256 newLockupPeriod) external override onlyRole(TIER_MANAGER) {
        config.lockupSeconds = newLockupPeriod;
    }

    function setSubscribable(bool isSubscribable) external override onlyRole(TIER_MANAGER) {
        config.subscribable = isSubscribable;
    }

    function setMultiplier(uint multiplier) external override onlyRole(TIER_MANAGER) {
        config.multiplier = multiplier;
        registry.rewardsPoolByTier[address(this)].snapshot();
    }

    function baseToken() external view returns (IERC20) {
        return config.baseToken;
    }

    function subscribeable() external view returns (bool) {
        return config.subscribable;
    }

    function multiplier() external view returns (uint) {
        return config.multiplier;
    }

    function sweep() external {
        require(config.baseToken.balanceOf(address(this)) > totalDeposits, "Nothing to sweep");
        SafeERC20.safeTransfer(config.baseToken, registry.treasury, config.baseToken.balanceOf(address(this)) - totalDeposits);
    }
}
