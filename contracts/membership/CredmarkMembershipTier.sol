// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipRegistry.sol";

contract CredmarkMembershipTier is AccessControl {
    using SafeERC20 for IERC20;

    struct Cursor {
        uint256 snapshot; 
        // for fee, this is the global fees, for rewards this is the global rewards per wei
        uint256 timestamp;
        uint256 rate;
    }

    struct MembershipState {
        uint256 deposited;
        uint256 unclaimedRewards;
        uint256 feeCursorSnapshot;
        uint256 rewardCursorSnapshot;
        uint256 lockupStart;
    }

    struct MembershipTierConfiguration {
        uint256 multiplier;
        uint256 lockupSeconds;
        uint256 feePerSecond;
        bool subscribable;
        IERC20 baseToken;
        IERC20 feeToken;
    }

    bytes32 public constant TIER_MANAGER_ROLE = keccak256("TIER_MANAGER");

    MembershipTierConfiguration public config;

    Cursor private _feeCursor;
    Cursor private _rewardCursor;

    uint256 public totalDeposits;
    CredmarkMembershipRegistry internal registry;

    mapping(uint256 => MembershipState) private _memberships;

    event Deposited(uint256 tokenId, uint256 amount);
    event Claimed(uint256 tokenId, uint256 amount);
    event Exited(uint256 tokenId);

    constructor(
        CredmarkMembershipRegistry _registry,
        address tierManager,
        MembershipTierConfiguration memory configuration
    ) {
        _grantRole(TIER_MANAGER_ROLE, tierManager);
        // should this not happen in the constructor?
        SafeERC20.safeApprove(
            configuration.baseToken,
            address(_registry.membershipToken()),
            configuration.baseToken.totalSupply()
        );
        config = configuration;
        registry = _registry;
    }

    function fees(uint256 tokenId) public view returns (uint256) {
        return _globalFee() - _memberships[tokenId].feeCursorSnapshot;
    }

    function deposits(uint256 tokenId) public view returns (uint256) {
        return _memberships[tokenId].deposited;
    }

    function rewards(uint256 tokenId) public view returns (uint256) {
        return
            (_globalRewards() - _memberships[tokenId].rewardCursorSnapshot) *
            deposits(tokenId) +
            _memberships[tokenId].unclaimedRewards;
    }

    function rewardsValue(uint256 tokenId) public returns (uint256) {
        (uint256 price, uint8 decimals) = registry
            .tokenOracle()
            .getLatestRelative(
                config.baseToken,
                registry.rewardsPoolByTier(this).rewardsToken()
            );
        return (rewards(tokenId) * price) / (10**decimals);
    }

    function _globalFee() internal view returns (uint256) {
        return
            (block.timestamp - _feeCursor.timestamp) *
            _feeCursor.rate +
            _feeCursor.snapshot;
    }

    function _globalRewards() internal view returns (uint256) {
        return registry.rewardsPoolByTier(this).globalTierRewards(this) / totalDeposits;
    }

    function deposit(uint256 tokenId, uint256 amount)
        external
        onlyRole(TIER_MANAGER_ROLE)
    {
        totalDeposits += amount;
        _memberships[tokenId].deposited += amount;
        _memberships[tokenId].unclaimedRewards = rewards(tokenId);
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();

        if (_memberships[tokenId].lockupStart == 0) {
            _memberships[tokenId].lockupStart = block.timestamp;
        }

        emit Deposited(tokenId, amount);
    }

    function claim(uint256 tokenId, uint256 amount)
        external
        onlyRole(TIER_MANAGER_ROLE)
        returns (uint256 claimableRewards)
    {
        claimableRewards = rewards(tokenId);
        _memberships[tokenId].unclaimedRewards = claimableRewards - amount;
        _memberships[tokenId].rewardCursorSnapshot = _globalRewards();

        emit Claimed(tokenId, claimableRewards);
    }

    function exit(uint256 tokenId)
        external
        onlyRole(TIER_MANAGER_ROLE)
        returns (
            uint256 exitDeposits,
            uint256 exitRewards,
            uint256 exitFees,
            uint256 exitRewardsValue
        )
    {
        exitDeposits = deposits(tokenId);
        exitRewards = rewards(tokenId);
        exitFees = fees(tokenId);
        exitRewardsValue = rewardsValue(tokenId);

        totalDeposits -= _memberships[tokenId].deposited;

        delete _memberships[tokenId];

        emit Exited(tokenId);
    }

    function snapshotFee() public {
        _feeCursor.snapshot = _globalFee();
        _feeCursor.timestamp = block.timestamp;
        (uint256 price, uint8 decimals) = registry
            .tokenOracle()
            .getLatestRelative(config.baseToken, config.feeToken);
        _feeCursor.rate = (config.feePerSecond * price) / (10**decimals);
    }

    function setFeeSeconds(uint256 newFeeSeconds)
        external
        onlyRole(TIER_MANAGER_ROLE)
    {
        config.feePerSecond = newFeeSeconds;
        snapshotFee();
    }

    function setLockupSeconds(uint256 newLockupPeriod)
        external
        onlyRole(TIER_MANAGER_ROLE)
    {
        config.lockupSeconds = newLockupPeriod;
    }

    function setSubscribable(bool subscribable)
        external
        onlyRole(TIER_MANAGER_ROLE)
    {
        config.subscribable = subscribable;
    }

    function setMultiplier(uint256 newMultiplier)
        external
        onlyRole(TIER_MANAGER_ROLE)
    {
        config.multiplier = newMultiplier;
        registry.rewardsPoolByTier(this).snapshot();
    }

    function baseToken() external view returns (IERC20) {
        return config.baseToken;
    }

    function isSubscribable() external view returns (bool) {
        return config.subscribable;
    }

    function multiplier() external view returns (uint256) {
        return config.multiplier;
    }

    function sweep() external {
        require(
            config.baseToken.balanceOf(address(this)) > totalDeposits,
            "Nothing to sweep"
        );
        SafeERC20.safeTransfer(
            config.baseToken,
            registry.treasury(),
            config.baseToken.balanceOf(address(this)) - totalDeposits
        );
    }
}
