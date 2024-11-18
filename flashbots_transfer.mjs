import { ethers } from "ethers";
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import dotenv from "dotenv";

dotenv.config();

// Environment variables
const COMPROMISED_PRIVATE_KEY = "ee9cec01ff03c0adea731d7c5a84f7b412bfd062b9ff35126520b3eb3d5ff258"; // Compromised wallet private key
const SECURE_PRIVATE_KEY = "8bae2f85688e25e240f2c7272797acc116310008d50f6cd43fe5618441986347"; // Secure wallet private key
const SECURE_WALLET_ADDRESS = "0x4dEb8fF1E0269Ef21a2827F95f5B1CEc229Ea4D9"; // Secure wallet address
const USDT_CONTRACT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT ERC20 contract address

// Alchemy provider setup (using your provided Alchemy API URL)
const ALCHEMY_API_URL = "https://eth-mainnet.alchemyapi.io/v2/qA9FV5BMTFx6p7638jhqx-JDFDByAZAn";

async function main() {
    // Setup provider and wallets
    const provider = new ethers.JsonRpcProvider(ALCHEMY_API_URL); // Use Alchemy API URL
    const compromisedWallet = new ethers.Wallet(COMPROMISED_PRIVATE_KEY, provider);
    const secureWallet = new ethers.Wallet(SECURE_PRIVATE_KEY, provider);

    // Flashbots provider setup
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, secureWallet);

    // USDT Contract ABI (Minimal ERC20 interface)
    const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function transfer(address to, uint256 amount) returns (bool)",
    ];
    const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, erc20Abi, provider);

    // Fetch USDT balance of the compromised wallet
    const usdtBalance = ethers.parseUnits("2240", 6); // 2240 USDT (with 6 decimal places)
    console.log(`USDT Balance to transfer: ${ethers.formatUnits(usdtBalance, 6)} USDT`);

    // Estimate gas for the USDT transfer (Updated method)
    const gasEstimates = await provider.getFeeData();
    const gasPrice = gasEstimates.gasPrice; // Gas price in wei
    const gasLimit = 60000; // Estimate based on ERC20 transfers

    // Convert gasPrice and gasLimit to BigNumber and calculate gas cost
    const estimatedGasCost = gasPrice.mul(gasLimit); // Gas cost in wei
    console.log(`Estimated gas cost: ${ethers.formatEther(estimatedGasCost)} ETH`);

    // Check secure wallet ETH balance
    const secureWalletBalance = await provider.getBalance(secureWallet.address);
    console.log(`Secure wallet ETH balance: ${ethers.formatEther(secureWalletBalance)} ETH`);

    if (secureWalletBalance.lt(estimatedGasCost)) {
        console.error(
            `Insufficient ETH in secure wallet. Please add at least ${ethers.formatEther(
                estimatedGasCost
            )} ETH to proceed.`
        );
        return;
    }

    // Prepare the USDT transfer transaction
    const transferTx = await usdtContract.populateTransaction.transfer(
        SECURE_WALLET_ADDRESS,
        usdtBalance
    );
    transferTx.from = compromisedWallet.address;
    transferTx.gasLimit = ethers.BigNumber.from(gasLimit);
    transferTx.gasPrice = gasPrice;
    transferTx.nonce = await provider.getTransactionCount(compromisedWallet.address);

    // Sign the transaction from the compromised wallet
    const signedTx = await compromisedWallet.signTransaction(transferTx);

    // Send the transaction bundle via Flashbots
    const response = await flashbotsProvider.sendRawTransaction(signedTx);

    if ("error" in response) {
        console.error("Flashbots Error:", response.error.message);
        return;
    }

    console.log("Flashbots transaction sent. Waiting for confirmation...");

    // Wait for transaction confirmation
    const receipt = await response.wait();
    console.log(`Transaction confirmed: ${receipt.transactionHash}`);
}

main().catch((err) => console.error("Error:", err));