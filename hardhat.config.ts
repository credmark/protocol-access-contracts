import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'dotenv/config';
import 'hardhat-gas-reporter';
import '@openzeppelin/hardhat-upgrades';
import { HardhatUserConfig } from 'hardhat/types';
import './tasks';

let accounts;
if (process.env.ACCOUNT_MNEMONIC) {
  accounts = {
    mnemonic: process.env.ACCOUNT_MNEMONIC,
  };
} else if (process.env.ACCOUNT_PRIVATE_KEY) {
  accounts = [process.env.ACCOUNT_PRIVATE_KEY];
}
const CHAIN_IDS = {
  hardhat: 31337, 
};
const config: HardhatUserConfig = {
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    currency: 'USD',
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  networks: {
    hardhat: {
      chainId: CHAIN_IDS.hardhat,
      forking: {
        enabled: true,
        url: `https://eth-mainnet.alchemyapi.io/v2/LilE1jthU7j0D4X6eBKbTG4Nak7MstUm`,
      }
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  solidity: {
    version: '0.8.7',
    settings: {
      optimizer: {
        enabled: true,
        runs: 800,
      },
      metadata: {
        // do not include the metadata hash, since this is machine dependent
        // and we want all generated code to be deterministic
        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
        bytecodeHash: 'none',
      },
    },
  },
};

export default config;
