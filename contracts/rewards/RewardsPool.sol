// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IRewardsPool.sol";

struct RecipientInfo {
    address account;
    uint256 multiplier;
    uint256 balance; // Only for internal use
}

contract RewardsPool is IRewardsPool, AccessControl {
    bytes32 public constant POOL_MANAGER = keccak256("POOL_MANAGER");

    IERC20 public rewardsToken;

    uint256 public lastRewardTime;
    uint256 public emissionRate;

    bool public started;

    mapping(address => RecipientInfo) public recipients;
    address[] public recipientsAddresses;
    uint256 private _factor;

    event PoolStarted();
    event EmissionRateChanged(uint256 emissionRate);
    event RewardsIssued(address indexed recipient, uint256 amount);

    constructor(IERC20 _rewardsToken) {
        rewardsToken = _rewardsToken;

        _grantRole(POOL_MANAGER, msg.sender);
    }

    function _now() internal view returns (uint256) {
        return block.timestamp;
    }

    function start(uint256 _emissionRate) external onlyRole(POOL_MANAGER) {
        require(!started, "Contract Already Started");

        lastRewardTime = _now();
        emissionRate = _emissionRate;
        started = true;

        emit EmissionRateChanged(_emissionRate);
        emit PoolStarted();
    }

    function setEmissionRate(uint256 newEmissionRate)
        external
        onlyRole(POOL_MANAGER)
    {
        if (emissionRate > 0) {
            issueRewards();
        }

        emissionRate = newEmissionRate;

        emit EmissionRateChanged(emissionRate);
    }

    function addRecipient(address account, uint256 multiplier)
        external
        onlyRole(POOL_MANAGER)
    {
        /**
         * Issuing rewards to update `lastRewardTime`.
         * Otherwise we will need to maintain recipient addition time for
         * effectiveBalance (multiplier * balance) computation
         */
        issueRewards();

        recipients[account] = RecipientInfo({
            account: account,
            multiplier: multiplier,
            balance: 0
        });
        recipientsAddresses.push(account);

        _increaseBalance(account, rewardsToken.balanceOf(account));
    }

    function _increaseBalance(address recipientAddress, uint256 amount)
        private
    {
        require(
            recipients[recipientAddress].account != address(0),
            "Invalid recipient"
        );
        _factor += amount * recipients[recipientAddress].multiplier;
        recipients[recipientAddress].balance += amount;
    }

    function _decreaseBalance(address recipientAddress, uint256 amount)
        private
    {
        require(
            recipients[recipientAddress].account != address(0),
            "Invalid recipient"
        );
        require(
            recipients[recipientAddress].balance >= amount,
            "Amount exceeds balance"
        );
        _factor -= amount * recipients[recipientAddress].multiplier;
        recipients[recipientAddress].balance -= amount;
    }

    function increaseBalance(uint256 amount) external override {
        _increaseBalance(msg.sender, amount);
    }

    function decreaseBalance(uint256 amount) external override {
        _decreaseBalance(msg.sender, amount);
    }

    function getLastRewardTime() external view returns (uint256) {
        return lastRewardTime;
    }

    function issueRewards() public override {
        if (!started) {
            return;
        }

        uint256 availableRewards = totalUnissuedRewards();
        uint256 factor = _factor;
        lastRewardTime = _now();
        if (availableRewards == 0 || factor == 0) {
            return;
        }

        for (uint256 i = 0; i < recipientsAddresses.length; i++) {
            uint256 rewardsAmount = (availableRewards *
                recipients[recipientsAddresses[i]].multiplier *
                recipients[recipientsAddresses[i]].balance) / factor;

            if (rewardsAmount > 0) {
                _increaseBalance(recipientsAddresses[i], rewardsAmount);
                SafeERC20.safeTransfer(
                    rewardsToken,
                    recipientsAddresses[i],
                    rewardsAmount
                );
                emit RewardsIssued(recipientsAddresses[i], rewardsAmount);
            }
        }
    }

    function totalUnissuedRewards()
        public
        view
        returns (uint256 rewardsAmount)
    {
        if (!started || emissionRate == 0 || lastRewardTime == 0) {
            return 0;
        }

        rewardsAmount = emissionRate * (_now() - lastRewardTime);
    }

    function unissuedRewards(address recipientAddress)
        public
        view
        override
        returns (uint256)
    {
        require(
            recipients[recipientAddress].account != address(0),
            "Invalid recipient"
        );

        uint256 availableRewards = totalUnissuedRewards();
        if (availableRewards == 0) {
            return 0;
        }

        if (_factor > 0) {
            return
                (availableRewards *
                    recipients[recipientAddress].multiplier *
                    recipients[recipientAddress].balance) / _factor;
        }

        return 0;
    }
}
