import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import {
  CredmarkAccessKey,
  MockCMK,
  CredmarkPriceOracleUsd,
  CredmarkAccessKeySubscriptionTier,
  RewardsPool,
} from '../typechain-types';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const THIRTY_DAYS_IN_SEC = 2592000;

const toWei = (num: bigint | number) => {
  if (typeof num === 'number') {
    num = BigInt(num);
  }

  return num * (BigInt(10) ** (BigInt(18)));
};

const fromWei = (num: bigint): bigint => {
  return num / (BigInt(10) ** BigInt(18));
};

describe('Credmark Access Key', () => {
  let cmk: MockCMK;
  let credmarkAccessKey: CredmarkAccessKey;

  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let credmarkDao: SignerWithAddress;
  let admin: SignerWithAddress;

  const fixture = async (): Promise<[MockCMK, CredmarkAccessKey]> => {
    const mockCmkFactory = await ethers.getContractFactory('MockCMK');
    const _cmk = (await mockCmkFactory.connect(admin).deploy()) as unknown as MockCMK;

    const credmarkAccessKeyFactory = await ethers.getContractFactory(
      'CredmarkAccessKey'
    );
    const _credmarkAccessKey = (await credmarkAccessKeyFactory
      .connect(admin)
      .deploy(await _cmk.getAddress(), await credmarkDao.getAddress())) as unknown as CredmarkAccessKey;

    return [_cmk.connect(wallet), _credmarkAccessKey.connect(wallet)];
  };

  beforeEach(async () => {
    [wallet, otherWallet, credmarkDao, admin] = await ethers.getSigners();
    [cmk, credmarkAccessKey] = await loadFixture(fixture);
  });

  it('should deploy', () => {});

  describe('#setDaoTreasury', () => {
    it('should only allow dao manager to set dao treasury', async () => {
      await expect(credmarkAccessKey.setDaoTreasury(await otherWallet.getAddress())).to.be
        .reverted;

      await credmarkAccessKey
        .connect(admin)
        .setDaoTreasury(await otherWallet.getAddress());
    });
  });

  describe('#mint', () => {
    it('should mint', async () => {
      const tokenId = BigInt(0);
      await expect(credmarkAccessKey.safeMint(await wallet.getAddress()))
        .to.emit(credmarkAccessKey, 'Transfer')
        .withArgs(ZERO_ADDRESS, await wallet.getAddress(), tokenId);

      expect(await credmarkAccessKey.balanceOf(await wallet.getAddress())).to.be.equal(1);
      expect(await credmarkAccessKey.ownerOf(tokenId)).to.be.equal(
        await wallet.getAddress()
      );
      expect(
        await credmarkAccessKey.tokenOfOwnerByIndex(await wallet.getAddress(), 0)
      ).to.be.equal(tokenId);
    });
  });

  describe('#subscriptionTier', () => {
    it('should create subscription tier', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      expect(await credmarkAccessKey.totalSupportedTiers()).to.be.equal(
        BigInt(1)
      );

      const newTierAddress = await credmarkAccessKey.supportedTiers(0);
      const newTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        newTierAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      expect(await newTier.subscribable()).to.be.equal(true);
      expect(await newTier.monthlyFeeUsdWei()).to.be.equal(toWei(100));
      expect(await newTier.debtPerSecond()).to.be.equal(
        toWei(100) * (BigInt(10000)) / (BigInt(2514)) / (BigInt(THIRTY_DAYS_IN_SEC))
      );
    });

    it('should not create subscription tier for non tier managers', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await expect(
        credmarkAccessKey.connect(otherWallet).createSubscriptionTier(
          await admin.getAddress(),
          await oracle.getAddress(),
          toWei(100),
          3600, // 1hour
          true
        )
      ).to.be.reverted;
    });
  });

  describe('#subscribe', () => {
    it('should subscribe', async () => {
      const tokenId = BigInt(0);
      const fundAmount = BigInt(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await credmarkAccessKey.safeMint(await wallet.getAddress());
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress);
    });

    it('should not subscribe unsupported tier', async () => {
      const tokenId = BigInt(0);
      const fundAmount = BigInt(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await credmarkAccessKey.safeMint(await wallet.getAddress());
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      const newTierFactory = await ethers.getContractFactory(
        'CredmarkAccessKeySubscriptionTier'
      );

      const newTier = (await newTierFactory.deploy(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        BigInt(3600), // 1hour
        await cmk.getAddress()
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await newTier.setSubscribable(true);

      await expect(
        credmarkAccessKey.subscribe(tokenId, await newTier.getAddress())
      ).to.be.revertedWith('Unsupported subscription');
    });

    it('should not subscribe locked tier', async () => {
      const tokenId = BigInt(0);
      const fundAmount = BigInt(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await credmarkAccessKey.safeMint(await wallet.getAddress());
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514
      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        false
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await expect(
        credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress)
      ).to.be.revertedWith('Tier is not subscribable');
    });

    it('should transfer funds on switching subscription tiers', async () => {
      const tokenId = BigInt(0);
      const fundAmount = toWei(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        0, // 1hour
        true
      );

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1000),
        3600, // 1hour
        true
      );

      const subscriptionTier1Address = await credmarkAccessKey.supportedTiers(
        0
      );

      const subscriptionTier2Address = await credmarkAccessKey.supportedTiers(
        1
      );

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTier1Address
      );

      expect(
        await credmarkAccessKey.totalCmkStaked(subscriptionTier1Address)
      ).to.be.equal(fundAmount);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTier2Address);

      expect(
        await credmarkAccessKey.totalCmkStaked(subscriptionTier1Address)
      ).to.be.equal(BigInt(0));

      expect(
        fromWei(
          await credmarkAccessKey.totalCmkStaked(subscriptionTier2Address)
        )
      ).to.be.closeTo(fromWei(fundAmount), 1);
    });
  });

  describe('#fund', () => {
    it('should fund', async () => {
      const tokenId = BigInt(0);
      const fundAmount = BigInt(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await credmarkAccessKey.safeMint(await wallet.getAddress());
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress);

      await credmarkAccessKey.fund(tokenId, fundAmount);

      expect(
        (await credmarkAccessKey.tokenInfo(tokenId)).cmkAmount
      ).to.be.equal(fundAmount);
    });
  });

  describe('#mintSubscribeAndFund', () => {
    it('should mint, fund & subscribe', async () => {
      const fundAmount = BigInt(1000);

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigInt(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );
    });
  });

  describe('#debt', () => {
    it('should be in debt with time', async () => {
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount * (BigInt(2)));

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount * (BigInt(2)));

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      // Token ID 1
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        BigInt(100) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigInt(100) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice),
        1
      );

      await credmarkAccessKey.resolveDebt(0);

      expect(await credmarkAccessKey.debt(0)).to.be.equal(0);

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigInt(100) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice),
        1
      );

      // Changing subscription tier fee to $200 per month
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier.connect(admin).setMonthlyFeeUsd(toWei(200));

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        BigInt(200) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigInt(100)
           * (BigInt(7))
           * (BigInt(10000))
           / (BigInt(30))
           / (cmkPrice)
           + (BigInt(200) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice)),
        1
      );
    });
  });

  describe('#burn', () => {
    it('should burn', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (0.25 cmk per $) ~= 93 CMK
      expect(fromWei(await credmarkAccessKey.debt(tokenId))).to.equal(
        BigInt(93)
      );

      expect(fromWei(await cmk.balanceOf(await credmarkDao.getAddress()))).to.equal(0);
      expect(fromWei(await cmk.balanceOf(await wallet.getAddress()))).to.equal(0);

      await credmarkAccessKey.burn(tokenId);

      expect(
        fromWei((await credmarkAccessKey.tokenInfo(tokenId)).cmkAmount)
      ).to.equal(0);

      expect(fromWei(await cmk.balanceOf(await credmarkDao.getAddress()))).to.equal(93);
      expect(fromWei(await cmk.balanceOf(await wallet.getAddress()))).to.equal(906);
      await expect(
        credmarkAccessKey.tokenOfOwnerByIndex(await wallet.getAddress(), tokenId)
      ).to.be.reverted;
    });

    it('should not burn for non-owner', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      await expect(
        credmarkAccessKey.connect(otherWallet).burn(tokenId)
      ).to.be.revertedWith('Approval required');
    });

    it('should not burn when debt exceeds balance', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (0.25 cmk per $) ~= 93 CMK
      expect(fromWei(await credmarkAccessKey.debt(tokenId))).to.equal(
        BigInt(93)
      );

      await expect(credmarkAccessKey.burn(tokenId)).to.be.revertedWith(
        'Access Key is not solvent'
      );
    });
  });

  describe('#liquidate', () => {
    it('should liquidate when debt exceeds balance', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      await credmarkAccessKey.connect(otherWallet).liquidate(tokenId);

      expect((await credmarkAccessKey.tokenInfo(tokenId)).cmkAmount).to.equal(
        0
      );
      expect(await cmk.balanceOf(await wallet.getAddress())).to.equal(0);
      expect(await cmk.balanceOf(await credmarkDao.getAddress())).to.equal(fundAmount);
    });

    it('should not liquidate when debt is less than balance', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      await expect(credmarkAccessKey.liquidate(tokenId)).to.be.revertedWith(
        'Access Key is solvent'
      );

      await expect(
        credmarkAccessKey.connect(otherWallet).liquidate(tokenId)
      ).to.be.revertedWith('Access Key is solvent');
    });
  });

  describe('#rewards', () => {
    it('should get rewards on burn', async () => {
      const tokenId = BigInt(0);
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(await cmk.getAddress())) as unknown as RewardsPool;

      await cmk.connect(admin).transfer(await rewardsPool.getAddress(), toWei(10_000_000));

      await rewardsPool.connect(admin).start(toWei(10)); // 10 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigInt(1));

      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier.connect(admin).setRewardsPool(await rewardsPool.getAddress());

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const debt = toWei(
        BigInt(100) * (BigInt(7)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice)
      );

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt), // ~93 CMK
        1
      );

      await credmarkAccessKey.burn(tokenId);

      const reward = BigInt(sevenDays) * (toWei(10));
      expect(fromWei(await cmk.balanceOf(await wallet.getAddress()))).to.be.closeTo(
        fromWei(fundAmount - (debt) + (reward)),
        100
      );
    });

    it('should get proportional rewards by multiplier', async () => {
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);
      await cmk.connect(admin).transfer(await otherWallet.getAddress(), fundAmount);

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);
      await cmk
        .connect(otherWallet)
        .approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1_000),
        3600, // 1hour
        true
      );

      const subscriptionTier1xAddress = await credmarkAccessKey.supportedTiers(
        0
      );

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1_000), // 1000 USD per month ~= 0.00154 CMK/s
        3600, // 1hour
        true
      );

      const subscriptionTier2xAddress = await credmarkAccessKey.supportedTiers(
        1
      );

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(await cmk.getAddress())) as unknown as RewardsPool;

      await cmk.connect(admin).transfer(await rewardsPool.getAddress(), toWei(10_000_000));

      await rewardsPool
        .connect(admin)
        .start(toWei(1) / (BigInt(1000))); // 0.001 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier1xAddress, BigInt(1));

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier2xAddress, BigInt(2));

      const subscriptionTier1x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier1xAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier1x
        .connect(admin)
        .setRewardsPool(await rewardsPool.getAddress());

      const subscriptionTier2x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier2xAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier2x
        .connect(admin)
        .setRewardsPool(await rewardsPool.getAddress());

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTier1xAddress
      );

      // Token ID 1
      await credmarkAccessKey
        .connect(otherWallet)
        .mintSubscribeAndFund(fundAmount, subscriptionTier2xAddress);

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // Rewards for seven days ~= 604 CMK
      const totalReward = BigInt(sevenDays) * (
        toWei(1) / (BigInt(1000))
      );

      // Debt for seven days ~= 933 CMK
      const debt = toWei(BigInt(1_000))
         * (BigInt(7))
         * (BigInt(10000))
         / (BigInt(30))
         / (cmkPrice);

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        fromWei(debt),
        1
      );

      await credmarkAccessKey.burn(0);
      expect(fromWei(await cmk.balanceOf(await wallet.getAddress()))).to.be.closeTo(
        fromWei(fundAmount + (totalReward / (BigInt(3))) - (debt)),
        1
      );

      await credmarkAccessKey.connect(otherWallet).burn(1);
      expect(fromWei(await cmk.balanceOf(await otherWallet.getAddress()))).to.be.closeTo(
        fromWei(fundAmount + (totalReward * (BigInt(2)) / (BigInt(3))) - (debt)),
        1
      );
    });

    it('should get proportional rewards by fund amount', async () => {
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);
      await cmk.connect(admin).transfer(await otherWallet.getAddress(), fundAmount * (BigInt(2)));

      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);
      await cmk
        .connect(otherWallet)
        .approve(await credmarkAccessKey.getAddress(), fundAmount * (BigInt(2)));

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1_000), // 1000 USD per month ~= 0.00154 CMK/s
        3600, // 1hour
        true
      );

      const subscriptionTier1xAddress = await credmarkAccessKey.supportedTiers(
        0
      );

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1_000), // 1000 USD per month ~= 0.00154 CMK/s
        3600, // 1hour
        true
      );

      const subscriptionTier2xAddress = await credmarkAccessKey.supportedTiers(
        1
      );

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(await cmk.getAddress())) as unknown as RewardsPool;

      await cmk.connect(admin).transfer(await rewardsPool.getAddress(), toWei(10_000_000));

      await rewardsPool
        .connect(admin)
        .start(toWei(1) / (BigInt(1000))); // 0.001 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier1xAddress, BigInt(1));

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier2xAddress, BigInt(1));

      const subscriptionTier1x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier1xAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier1x
        .connect(admin)
        .setRewardsPool(await rewardsPool.getAddress());

      const subscriptionTier2x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier2xAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier2x
        .connect(admin)
        .setRewardsPool(await rewardsPool.getAddress());

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTier1xAddress
      );

      // Token ID 1
      await credmarkAccessKey
        .connect(otherWallet)
        .mintSubscribeAndFund(fundAmount * (BigInt(2)), subscriptionTier2xAddress);

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // Rewards for seven days ~= 604 CMK
      const totalReward = BigInt(sevenDays) * (
        toWei(1) / (BigInt(1000))
      );

      // Debt for seven days ~= 933 CMK
      const debt = toWei(BigInt(1_000))
         * (BigInt(7))
         * (BigInt(10000))
         / (BigInt(30))
         / (cmkPrice);

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        fromWei(debt),
        1
      );

      await credmarkAccessKey.burn(0);
      expect(fromWei(await cmk.balanceOf(await wallet.getAddress()))).to.be.closeTo(
        fromWei(fundAmount + (totalReward / (BigInt(3))) - (debt)),
        1
      );

      await credmarkAccessKey.connect(otherWallet).burn(1);
      expect(fromWei(await cmk.balanceOf(await otherWallet.getAddress()))).to.be.closeTo(
        fromWei(fundAmount * (BigInt(2)) + (totalReward * (BigInt(2)) / (BigInt(3))) - (debt)),
        1
      );
    });

    it('should remove cmk+rewards on resolveDebt', async () => {
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(1_000), // 1000 USD per month ~= 0.00154 CMK/s
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');
      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(await cmk.getAddress())) as unknown as RewardsPool;

      await cmk.connect(admin).transfer(await rewardsPool.getAddress(), toWei(10_000_000));

      await rewardsPool
        .connect(admin)
        .start(toWei(1) / (BigInt(1000))); // 0.001 CMK per second
      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigInt(1));

      await subscriptionTier.connect(admin).setRewardsPool(await rewardsPool.getAddress());

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect((await credmarkAccessKey.tokenInfo(0)).cmkAmount).to.be.equal(
        fundAmount
      );

      await credmarkAccessKey.resolveDebt(0);

      // Rewards for seven days ~= 604 CMK
      const totalReward = BigInt(sevenDays) * (
        toWei(1) / (BigInt(1000))
      );

      // Debt for seven days ~= 933 CMK
      const debt = toWei(BigInt(1_000))
         * (BigInt(7))
         * (BigInt(10000))
         / (BigInt(30))
         / (cmkPrice);

      // CMK unstaked to resolve 933 CMK debt ~= 581 CMK
      const unstakedCmk = debt * (fundAmount) / (fundAmount + (totalReward));

      // Updated balance ~= 419 CMK
      const newBalance = fundAmount - (unstakedCmk);

      expect(
        fromWei((await credmarkAccessKey.tokenInfo(0)).cmkAmount)
      ).to.be.closeTo(fromWei(newBalance), 1);

      expect(fromWei(await cmk.balanceOf(await credmarkDao.getAddress()))).to.be.closeTo(
        fromWei(debt),
        1
      );

      await ethers.provider.send('evm_increaseTime', [sevenDays * 4]);
      await ethers.provider.send('evm_mine', []);

      // After 28 days,
      // debt would 933 * 4 ~= 3732
      // rewards would be 604 * 4 ~= 2416
      // So resolve debt should revert since debt < reward + balance(~419)

      await expect(credmarkAccessKey.resolveDebt(0)).to.be.revertedWith(
        'Insufficient fund'
      );
    });

    it('should remove cmk+rewards on liquidate', async () => {
      const cmkPrice = BigInt(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(await wallet.getAddress(), fundAmount);
      await cmk.approve(await credmarkAccessKey.getAddress(), fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as unknown as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        await admin.getAddress(),
        await oracle.getAddress(),
        toWei(500_000),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as unknown as CredmarkAccessKeySubscriptionTier;

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');
      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(await cmk.getAddress())) as unknown as RewardsPool;

      await cmk.connect(admin).transfer(await rewardsPool.getAddress(), toWei(10_000_000));

      const rewardRate = toWei(1) / (BigInt(100));
      await rewardsPool.connect(admin).start(rewardRate); // 0.01 CMK per second
      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigInt(1));

      await subscriptionTier.connect(admin).setRewardsPool(await rewardsPool.getAddress());

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const totalReward = BigInt(sevenDays) * (BigInt(2)) * (rewardRate);
      const debt = toWei(
        BigInt(500_000) * (BigInt(14)) * (BigInt(10000)) / (BigInt(30)) / (cmkPrice)
      );

      await expect(credmarkAccessKey.resolveDebt(0)).to.be.revertedWith(
        'Insufficient fund'
      );

      await credmarkAccessKey.connect(otherWallet).liquidate(0);

      expect((await credmarkAccessKey.tokenInfo(0)).cmkAmount).to.be.equal(0);

      expect(fromWei(await cmk.balanceOf(await credmarkDao.getAddress()))).to.be.closeTo(
        fromWei(fundAmount + (totalReward)),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt - (totalReward) - (fundAmount)),
        1
      );
    });
  });
});
