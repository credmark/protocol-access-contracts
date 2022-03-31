// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract CredmarkModel is ERC721, Pausable, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    Counters.Counter private _tokenIdCounter;

    mapping(uint256 => uint256) public slugHashes;
    mapping(uint256 => uint256) private slugTokens;

    event NFTMinted(uint256 tokenId, uint256 slugHash);

    constructor() ERC721("CredmarkModel", "CMKm") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://api.credmark.com/v1/meta/model/";
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function safeMint(address to, string memory _slug)
        public
        onlyRole(MINTER_ROLE)
    {
        uint256 slugHash = getSlugHash(_slug);

        require(slugTokens[slugHash] == 0x0, "Slug already Exists");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        slugHashes[tokenId] = slugHash;
        slugTokens[slugHash] = tokenId;

        _safeMint(to, tokenId);

        emit NFTMinted(tokenId, slugHash);
    }

    function getSlugHash(string memory _slug) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_slug)));
    }

    function getHashById(uint256 _tokenId) public view returns (uint256) {
        return slugHashes[_tokenId];
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
