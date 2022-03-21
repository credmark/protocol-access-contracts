import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import {
  CredmarkAccessKey,
  MockCMK,
  CredmarkPriceOracleUsd,
  CredmarkAccessKeySubscriptionTier,
  RewardsPool,
} from '../typechain';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const THIRTY_DAYS_IN_SEC = 2592000;

const toWei = (num: BigNumber | number) => {
  if (typeof num === 'number') {
    num = BigNumber.from(num);
  }

  return num.mul(BigNumber.from(10).pow(18));
};

const fromWei = (num: BigNumber) => {
  return num.div(BigNumber.from(10).pow(18));
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
    const _cmk = (await mockCmkFactory.connect(admin).deploy()) as MockCMK;

    const credmarkAccessKeyFactory = await ethers.getContractFactory(
      'CredmarkAccessKey'
    );
    const _credmarkAccessKey = (await credmarkAccessKeyFactory
      .connect(admin)
      .deploy(_cmk.address, credmarkDao.address)) as CredmarkAccessKey;

    return [_cmk.connect(wallet), _credmarkAccessKey.connect(wallet)];
  };

  beforeEach(async () => {
    [wallet, otherWallet, credmarkDao, admin] = await ethers.getSigners();
    [cmk, credmarkAccessKey] = await waffle.loadFixture(fixture);
  });

  it('should deploy', () => {});

  describe('#setDaoTreasury', () => {
    it('should only allow dao manager to set dao treasury', async () => {
      await expect(credmarkAccessKey.setDaoTreasury(otherWallet.address)).to.be
        .reverted;

      await credmarkAccessKey
        .connect(admin)
        .setDaoTreasury(otherWallet.address);
    });
  });

  describe('#mint', () => {
    it('should mint', async () => {
      const tokenId = BigNumber.from(0);
      await expect(credmarkAccessKey.safeMint(wallet.address))
        .to.emit(credmarkAccessKey, 'Transfer')
        .withArgs(ZERO_ADDRESS, wallet.address, tokenId);

      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(1);
      expect(await credmarkAccessKey.ownerOf(tokenId)).to.be.equal(
        wallet.address
      );
      expect(
        await credmarkAccessKey.tokenOfOwnerByIndex(wallet.address, 0)
      ).to.be.equal(tokenId);
    });
  });

  describe('#subscriptionTier', () => {
    it('should create subscription tier', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      expect(await credmarkAccessKey.totalSupportedTiers()).to.be.equal(
        BigNumber.from(1)
      );

      const newTierAddress = await credmarkAccessKey.supportedTiers(0);
      const newTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        newTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      expect(await newTier.subscribable()).to.be.equal(true);
      expect(await newTier.monthlyFeeUsdWei()).to.be.equal(toWei(100));
      expect(await newTier.debtPerSecond()).to.be.equal(
        toWei(100).mul(10000).div(2514).div(THIRTY_DAYS_IN_SEC)
      );
    });

    it('should not create subscription tier for non tier managers', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await expect(
        credmarkAccessKey.connect(otherWallet).createSubscriptionTier(
          admin.address,
          oracle.address,
          toWei(100),
          3600, // 1hour
          true
        )
      ).to.be.reverted;
    });
  });

  describe('#subscribe', () => {
    it('should subscribe', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress);
    });

    it('should not subscribe unsupported tier', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      const newTierFactory = await ethers.getContractFactory(
        'CredmarkAccessKeySubscriptionTier'
      );

      const newTier = (await newTierFactory.deploy(
        admin.address,
        oracle.address,
        toWei(100),
        BigNumber.from(3600), // 1hour
        cmk.address
      )) as CredmarkAccessKeySubscriptionTier;

      await newTier.setSubscribable(true);

      await expect(
        credmarkAccessKey.subscribe(tokenId, newTier.address)
      ).to.be.revertedWith('Unsupported subscription');
    });

    it('should not subscribe locked tier', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514
      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        false
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await expect(
        credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress)
      ).to.be.revertedWith('Tier is not subscribable');
    });
  });

  describe('#fund', () => {
    it('should fund', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount.mul(2));

      await cmk.approve(credmarkAccessKey.address, fundAmount.mul(2));

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      await credmarkAccessKey.resolveDebt(0);

      expect(await credmarkAccessKey.debt(0)).to.be.equal(0);

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      // Changing subscription tier fee to $200 per month
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier.connect(admin).setMonthlyFeeUsd(toWei(200));

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        BigNumber.from(200).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(1))).to.be.closeTo(
        BigNumber.from(100)
          .mul(7)
          .mul(10000)
          .div(30)
          .div(cmkPrice)
          .add(BigNumber.from(200).mul(7).mul(10000).div(30).div(cmkPrice)),
        1
      );
    });
  });

  describe('#burn', () => {
    it('should burn', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
        BigNumber.from(93)
      );

      expect(fromWei(await cmk.balanceOf(credmarkDao.address))).to.equal(0);
      expect(fromWei(await cmk.balanceOf(wallet.address))).to.equal(0);

      await credmarkAccessKey.burn(tokenId);

      expect(
        fromWei((await credmarkAccessKey.tokenInfo(tokenId)).cmkAmount)
      ).to.equal(0);

      expect(fromWei(await cmk.balanceOf(credmarkDao.address))).to.equal(93);
      expect(fromWei(await cmk.balanceOf(wallet.address))).to.equal(906);
      await expect(
        credmarkAccessKey.tokenOfOwnerByIndex(wallet.address, tokenId)
      ).to.be.reverted;
    });

    it('should not burn for non-owner', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
        BigNumber.from(93)
      );

      await expect(credmarkAccessKey.burn(tokenId)).to.be.revertedWith(
        'Access Key is not solvent'
      );
    });
  });

  describe('#liquidate', () => {
    it('should liquidate when debt exceeds balance', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
      expect(await cmk.balanceOf(wallet.address)).to.equal(0);
      expect(await cmk.balanceOf(credmarkDao.address)).to.equal(fundAmount);
    });

    it('should not liquidate when debt is less than balance', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(10); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
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
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(cmk.address)) as RewardsPool;

      await cmk.connect(admin).transfer(rewardsPool.address, toWei(10_000_000));

      await rewardsPool.connect(admin).start(toWei(10)); // 10 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigNumber.from(1));

      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier.connect(admin).setRewardsPool(rewardsPool.address);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const debt = toWei(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice)
      );

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt), // ~93 CMK
        1
      );

      await credmarkAccessKey.burn(tokenId);

      const reward = BigNumber.from(sevenDays).mul(toWei(10));
      expect(fromWei(await cmk.balanceOf(wallet.address))).to.be.closeTo(
        fromWei(fundAmount.sub(debt).add(reward)),
        100
      );
    });

    it('should get proportional rewards by multiplier', async () => {
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);
      await cmk.connect(admin).transfer(otherWallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);
      await cmk
        .connect(otherWallet)
        .approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTier1xAddress = await credmarkAccessKey.supportedTiers(
        0
      );

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTier2xAddress = await credmarkAccessKey.supportedTiers(
        1
      );

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(cmk.address)) as RewardsPool;

      await cmk.connect(admin).transfer(rewardsPool.address, toWei(10_000_000));

      await rewardsPool.connect(admin).start(toWei(1)); // 1 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier1xAddress, BigNumber.from(1));

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier2xAddress, BigNumber.from(2));

      const subscriptionTier1x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier1xAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier1x
        .connect(admin)
        .setRewardsPool(rewardsPool.address);

      const subscriptionTier2x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier2xAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier2x
        .connect(admin)
        .setRewardsPool(rewardsPool.address);

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

      const debt = toWei(100).mul(7).mul(10000).div(30).div(cmkPrice);
      const totalReward = BigNumber.from(sevenDays).mul(toWei(1));

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt), // ~93 CMK
        1
      );

      await credmarkAccessKey.burn(0);
      expect(fromWei(await cmk.balanceOf(wallet.address))).to.be.closeTo(
        fromWei(fundAmount.add(totalReward.div(3)).sub(debt)),
        200
      );

      await credmarkAccessKey.connect(otherWallet).burn(1);
      expect(fromWei(await cmk.balanceOf(otherWallet.address))).to.be.closeTo(
        fromWei(fundAmount.add(totalReward.mul(2).div(3)).sub(debt)),
        200
      );
    });

    it('should get proportional rewards by fund amount', async () => {
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);
      await cmk.connect(admin).transfer(otherWallet.address, fundAmount.mul(2));

      await cmk.approve(credmarkAccessKey.address, fundAmount);
      await cmk
        .connect(otherWallet)
        .approve(credmarkAccessKey.address, fundAmount.mul(2));

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTier1xAddress = await credmarkAccessKey.supportedTiers(
        0
      );

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(100),
        3600, // 1hour
        true
      );

      const subscriptionTier2xAddress = await credmarkAccessKey.supportedTiers(
        1
      );

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');

      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(cmk.address)) as RewardsPool;

      await cmk.connect(admin).transfer(rewardsPool.address, toWei(10_000_000));

      await rewardsPool.connect(admin).start(toWei(1)); // 1 CMK per second

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier1xAddress, BigNumber.from(1));

      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTier2xAddress, BigNumber.from(1));

      const subscriptionTier1x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier1xAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier1x
        .connect(admin)
        .setRewardsPool(rewardsPool.address);

      const subscriptionTier2x = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTier2xAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier2x
        .connect(admin)
        .setRewardsPool(rewardsPool.address);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTier1xAddress
      );

      // Token ID 1
      await credmarkAccessKey
        .connect(otherWallet)
        .mintSubscribeAndFund(fundAmount.mul(2), subscriptionTier2xAddress);

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const debt = toWei(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice)
      );
      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt), // ~93 CMK
        1
      );

      await credmarkAccessKey.burn(0);
      await credmarkAccessKey.connect(otherWallet).burn(1);

      const totalReward = BigNumber.from(sevenDays).mul(toWei(1));

      expect(fromWei(await cmk.balanceOf(wallet.address))).to.be.closeTo(
        fromWei(fundAmount.sub(debt).add(totalReward.div(3))),
        1000
      );

      expect(fromWei(await cmk.balanceOf(otherWallet.address))).to.be.closeTo(
        fromWei(fundAmount.sub(debt).add(totalReward.mul(2).div(3))),
        1000
      );
    });

    it('should remove cmk+rewards on resolveDebt', async () => {
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(1_000), // 1000 USD per month ~= 0.00154 CMK/s
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');
      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(cmk.address)) as RewardsPool;

      await cmk.connect(admin).transfer(rewardsPool.address, toWei(10_000_000));

      await rewardsPool
        .connect(admin)
        .start(toWei(1).div(BigNumber.from(1000))); // 0.001 CMK per second
      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigNumber.from(1));

      await subscriptionTier.connect(admin).setRewardsPool(rewardsPool.address);

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
      const totalReward = BigNumber.from(sevenDays).mul(
        toWei(1).div(BigNumber.from(1000))
      );

      // Debt for seven days ~= 933 CMK
      const debt = toWei(BigNumber.from(1_000))
        .mul(7)
        .mul(10000)
        .div(30)
        .div(cmkPrice);

      // CMK unstaked to resolve 933 CMK debt ~= 581 CMK
      const unstakedCmk = debt.mul(fundAmount).div(fundAmount.add(totalReward));

      // Updated balance ~= 419 CMK
      const newBalance = fundAmount.sub(unstakedCmk);

      expect(
        fromWei((await credmarkAccessKey.tokenInfo(0)).cmkAmount)
      ).to.be.closeTo(fromWei(newBalance), 1);

      expect(fromWei(await cmk.balanceOf(credmarkDao.address))).to.be.closeTo(
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
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = toWei(1000); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        toWei(500_000),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      const rewardsPoolFactory = await ethers.getContractFactory('RewardsPool');
      const rewardsPool = (await rewardsPoolFactory
        .connect(admin)
        .deploy(cmk.address)) as RewardsPool;

      await cmk.connect(admin).transfer(rewardsPool.address, toWei(10_000_000));

      const rewardRate = toWei(1).div(100);
      await rewardsPool.connect(admin).start(rewardRate); // 0.01 CMK per second
      await rewardsPool
        .connect(admin)
        .addRecipient(subscriptionTierAddress, BigNumber.from(1));

      await subscriptionTier.connect(admin).setRewardsPool(rewardsPool.address);

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

      const totalReward = BigNumber.from(sevenDays).mul(2).mul(rewardRate);
      const debt = toWei(
        BigNumber.from(500_000).mul(14).mul(10000).div(30).div(cmkPrice)
      );

      await expect(credmarkAccessKey.resolveDebt(0)).to.be.revertedWith(
        'Insufficient fund'
      );

      await credmarkAccessKey.connect(otherWallet).liquidate(0);

      expect((await credmarkAccessKey.tokenInfo(0)).cmkAmount).to.be.equal(0);

      expect(fromWei(await cmk.balanceOf(credmarkDao.address))).to.be.closeTo(
        fromWei(fundAmount.add(totalReward)),
        1
      );

      expect(fromWei(await credmarkAccessKey.debt(0))).to.be.closeTo(
        fromWei(debt.sub(totalReward).sub(fundAmount)),
        1
      );
    });
  });
});
