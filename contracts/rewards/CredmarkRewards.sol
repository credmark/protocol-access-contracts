// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract CredmarkRewards is AccessControl {

    using MerkleProof for bytes32[];
    event RewardsClaimed(address indexed _address, uint256 _value);

    bytes32 merkleRoot;

    ERC20 rewardsToken;
    ERC721 nonFungibleToken;

    constructor(address admin, ERC20 _rewardsToken, ERC721 _nonFungibleToken) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        rewardsToken = _rewardsToken;
        nonFungibleToken = _nonFungibleToken;
    }

    mapping (uint => uint) claimed;

    function setMerkleRoot(bytes32 root) onlyRole(DEFAULT_ADMIN_ROLE) public 
    {
        merkleRoot = root;
    }

    function claimRewards(
        uint tokenId,
        uint amount,
        bytes32[] memory proof
    ) external {

        bytes32 leaf = keccak256(abi.encodePacked(tokenId, amount));
        
        require(MerkleProof.verify(proof, merkleRoot, leaf), "Proof invalid.");

        uint unclaimedRewards = amount - claimed[tokenId];
        address tokenOwner = nonFungibleToken.ownerOf(tokenId);

        rewardsToken.transfer(tokenOwner, unclaimedRewards);
        emit RewardsClaimed(tokenOwner, unclaimedRewards);
    }
}