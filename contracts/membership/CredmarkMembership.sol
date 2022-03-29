// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IRewardsPool.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";


contract CredmarkMembership is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant MEMBERSHIP_MANAGER = keccak256("MEMBERSHIP_MANAGER");
    
    CredmarkMembershipTier[] public tiers;
    CredmarkMembershipToken public membershipToken;
    IRewardsPool public rewardsPool;
    address public treasury;

    event TierCreated(address TierAddress);

    constructor(
            IRewardsPool _rewardsPool, 
            address _treasury) {

        _grantRole(MEMBERSHIP_MANAGER, msg.sender);
        treasury = _treasury;
        rewardsPool = _rewardsPool;
        membershipToken = new CredmarkMembershipToken();
    }

    function createTier(CredmarkMembershipTier.MembershipTierConfiguration calldata tierConfiguration) external onlyRole(MEMBERSHIP_MANAGER) {
        CredmarkMembershipTier tier = new CredmarkMembershipTier(tierConfiguration);
        tiers.push(tier);

        emit TierCreated(address(tier));
    }

    function tierCount() public view returns (uint) {
        return tiers.length;
    }

    function rebalanceRewards() external {
        rewardsPool.rewardsPerSecond() / _totalShares;
    }

    function totalShares() external view returns (uint){
        uint _totalShares;
        for(uint i =0; i<tierCount(); i++){
            (uint multiplier,,,,,,,) = tiers[i].config();
            _totalShares += tiers[i].totalDeposits() * multiplier; 
        }
        return _totalShares;
    }

}
