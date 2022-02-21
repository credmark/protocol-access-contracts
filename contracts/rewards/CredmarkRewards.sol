// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract CredmarkRewards is AccessControl {
    using MerkleProof for bytes32[];

    bytes32 public merkleRoot;

    ERC20 public rewardsToken;
    ERC721 public nonFungibleToken;
    mapping(uint256 => uint256) public claimed;

    event RewardsClaimed(address indexed _address, uint256 _value);

    constructor(
        address admin,
        ERC20 _rewardsToken,
        ERC721 _nonFungibleToken
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        rewardsToken = _rewardsToken;
        nonFungibleToken = _nonFungibleToken;
    }

    function setMerkleRoot(bytes32 root) public onlyRole(DEFAULT_ADMIN_ROLE) {
        merkleRoot = root;
    }

    function claimRewards(
        uint256 tokenId,
        uint256 amount,
        bytes32[] memory proof
    ) external {
        bytes32 leaf = keccak256(abi.encodePacked(tokenId, amount));

        require(MerkleProof.verify(proof, merkleRoot, leaf), "Proof invalid.");

        uint256 unclaimedRewards = amount - claimed[tokenId];
        address tokenOwner = nonFungibleToken.ownerOf(tokenId);

        rewardsToken.transfer(tokenOwner, unclaimedRewards);
        emit RewardsClaimed(tokenOwner, unclaimedRewards);
    }
}
