import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { MerkleTree } from 'merkletreejs';
import { CredmarkRewards, MockCMK, MockNFT } from '../typechain-types';
import { expect } from 'chai';

describe('Credmark Rewards', () => {
  let cmk: MockCMK;
  let nft: MockNFT;
  let credmarkRewards: CredmarkRewards;

  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let admin: SignerWithAddress;

  let merkleTree: MerkleTree;

  const leaves = [
    {
      tokenId: BigInt(0),
      amount: BigInt(1),
    },
    {
      tokenId: BigInt(1),
      amount: BigInt(100),
    },
    {
      tokenId: BigInt(2),
      amount: BigInt(3) * (BigInt(10) ** (BigInt(18))),
    },
    {
      tokenId: BigInt(3),
      amount: BigInt(4) * (BigInt(10) ** (BigInt(18))),
    },
    {
      tokenId: BigInt(4),
      amount: BigInt(5) * (BigInt(10) ** (BigInt(18))),
    },
    {
      tokenId: BigInt(5),
      amount: BigInt(50) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18))),
    },
  ];

  const encodeLeaf = (leaf: { tokenId: bigint; amount: bigint }) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256'],
        [leaf.tokenId, leaf.amount]
      )
    );

  const fixture = async (): Promise<[MockCMK, MockNFT, CredmarkRewards]> => {
    const mockCmkFactory = await ethers.getContractFactory('MockCMK');
    const _cmk = (await mockCmkFactory.connect(admin).deploy()) as unknown as MockCMK;

    const mockNftFactory = await ethers.getContractFactory('MockNFT');
    const _nft = (await mockNftFactory.connect(admin).deploy()) as unknown as MockNFT;

    const credmarkRewardsFactory = await ethers.getContractFactory(
      'CredmarkRewards'
    );
    const _credmarkRewards = (await credmarkRewardsFactory
      .connect(admin)
      .deploy(await admin.getAddress(), await _cmk.getAddress(), await _nft.getAddress())) as unknown as CredmarkRewards;

    return [
      _cmk.connect(wallet),
      _nft.connect(wallet),
      _credmarkRewards.connect(wallet),
    ];
  };

  beforeEach(async () => {
    [wallet, otherWallet, admin] = await ethers.getSigners();
    [cmk, nft, credmarkRewards] = await loadFixture(fixture);

    merkleTree = new MerkleTree(
      leaves.map((leaf) => encodeLeaf(leaf)),
      ethers.keccak256,
      { sort: true }
    );
  });

  describe('#deploy', () => {
    it('should deploy', () => {});
  });

  describe('#setMerkleRoot', () => {
    it('should allow setting root', async () => {
      const root = merkleTree.getHexRoot();
      await credmarkRewards.connect(admin).setMerkleRoot(root);

      const newRoot = await credmarkRewards.merkleRoot();
      expect(newRoot).to.equal(root);
    });

    it('should not allow setting root for non admin', async () => {
      await expect(credmarkRewards.setMerkleRoot(merkleTree.getHexRoot())).to.be
        .reverted;
    });

    it('should fail on setting root more than once', async () => {
      const root = merkleTree.getHexRoot();
      await credmarkRewards.connect(admin).setMerkleRoot(root);
      await expect(
        credmarkRewards.connect(admin).setMerkleRoot(merkleTree.getHexRoot())
      ).to.be.revertedWith('Root already set');
    });
  });

  describe('#claimRewards', () => {
    it('should allow claiming rewards', async () => {
      await cmk
        .connect(admin)
        .transfer(
          await credmarkRewards.getAddress(),
          BigInt(100) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18)))
        );

      await nft.safeMint(await wallet.getAddress()); // 0
      await nft.safeMint(await wallet.getAddress()); // 1
      await nft.safeMint(await wallet.getAddress()); // 2

      await nft.safeMint(await otherWallet.getAddress()); // 3
      await nft.safeMint(await otherWallet.getAddress()); // 4
      await nft.safeMint(await otherWallet.getAddress()); // 5

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      for (const leaf of leaves) {
        const tokenOwner = await nft.ownerOf(leaf.tokenId);
        await expect(
          credmarkRewards.claimRewards(
            leaf.tokenId,
            leaf.amount,
            merkleTree.getHexProof(encodeLeaf(leaf))
          )
        )
          .to.emit(credmarkRewards, 'RewardsClaimed')
          .withArgs(tokenOwner, leaf.amount);
      }
    });

    it('should claim rewards only once', async () => {
      await cmk
        .connect(admin)
        .transfer(
          await credmarkRewards.getAddress(),
          BigInt(100) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18)))
        );

      await nft.safeMint(await wallet.getAddress()); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(await wallet.getAddress(), leaf.amount);

      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(await wallet.getAddress(), BigInt(0));
    });

    it('should fail to claim rewards for unminted nft', async () => {
      await cmk
        .connect(admin)
        .transfer(
          await credmarkRewards.getAddress(),
          BigInt(100) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18)))
        );

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      ).to.be.revertedWith('ERC721: invalid token ID');
    });

    it('should fail to claim rewards for wrong amount', async () => {
      await cmk
        .connect(admin)
        .transfer(
          await credmarkRewards.getAddress(),
          BigInt(100) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18)))
        );

      await nft.safeMint(await wallet.getAddress()); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount + (BigInt(1)),
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      ).to.be.revertedWith('Invalid proof');

      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(
            encodeLeaf({ tokenId: leaf.tokenId, amount: leaf.amount + (BigInt(1)) })
          )
        )
      ).to.be.revertedWith('Invalid proof');
    });

    it('should reward to owner of nft only', async () => {
      await cmk
        .connect(admin)
        .transfer(
          await credmarkRewards.getAddress(),
          BigInt(100) * (BigInt(1e6)) * (BigInt(10) ** (BigInt(18)))
        );

      await nft.safeMint(await wallet.getAddress()); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards
          .connect(otherWallet)
          .claimRewards(
            leaf.tokenId,
            leaf.amount,
            merkleTree.getHexProof(encodeLeaf(leaf))
          )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(await wallet.getAddress(), leaf.amount);

      expect(await cmk.balanceOf(await wallet.getAddress())).to.equal(leaf.amount);
      expect(await cmk.balanceOf(await otherWallet.getAddress())).to.equal(
        BigInt(0)
      );
    });
  });
});
