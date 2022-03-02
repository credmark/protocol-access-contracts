import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { CredmarkModeler } from '../typechain';

describe('Credmark Modeler', () => {
    let credmarkModeler: CredmarkModeler;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let minterRole = ethers.utils.id("MINTER_ROLE");
    let pauserRole = ethers.utils.id("PAUSER_ROLE");

    const fixture = async () => {
        const credmarkModelerFactory = await ethers.getContractFactory('CredmarkModeler');
        return (await credmarkModelerFactory.deploy()) as CredmarkModeler;
    }

    beforeEach(async () => {
        credmarkModeler = await waffle.loadFixture(fixture);
        [deployer, alice, bob] = await ethers.getSigners();

    });

    it('Should construct', async () => {
        expect(await credmarkModeler.name()).to.equal('CredmarkModeler');
        expect(await credmarkModeler.symbol()).to.equal('CMKmlr');
        expect(await credmarkModeler.hasRole(minterRole, deployer.address)).to.equal(true);
        expect(await credmarkModeler.hasRole(pauserRole, deployer.address)).to.equal(true);
    })

    describe('#pause/unpause', () => {
        it('must be done by deployer', async () => {
            //pause by deployer
            await credmarkModeler.connect(deployer).pause();
            expect(await credmarkModeler.paused()).to.equal(true);
            
            //unpuase by pauser
            await credmarkModeler.grantRole(pauserRole, alice.address);

            await credmarkModeler.connect(alice).unpause();
            expect(await credmarkModeler.paused()).to.equal(false);

        });

        it('should not be done by non-deployer', async () => {
            await expect(credmarkModeler.connect(alice).pause()).to.be.reverted;
            await expect(credmarkModeler.connect(alice).unpause()).to.be.reverted;

        })
    });

    describe('#mint', () => {
        const tokenId = BigNumber.from(0);

        it('must be done by MINTER_ROLE', async () => {
            await expect(credmarkModeler.connect(alice).safeMint(alice.address)).to.reverted;

            //grant minter role to normal user

            await credmarkModeler.connect(deployer).grantRole(minterRole, alice.address);
            
            await expect(
                credmarkModeler.connect(alice).safeMint
                (bob.address)
                )
                .to.emit(credmarkModeler, "NFTMinted")
                .withArgs(tokenId);
                });


        it('Check if minted successfully', async () => {
            await credmarkModeler.connect(deployer).safeMint(alice.address);
            expect(await credmarkModeler.balanceOf(alice.address)).to.equal(1);

        })

        it('Can not mint again using same slug', async () => {
            await credmarkModeler.connect(deployer).safeMint(alice.address);           
            
            await expect(credmarkModeler.connect(deployer).safeMint(bob.address)).to.be.revertedWith(
                'Slug already Exists'
            );
        })

        
    })

}) 