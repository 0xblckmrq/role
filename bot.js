const { Client, GatewayIntentBits } = require("discord.js");
const express = require("express");
const { ethers } = require("ethers");
const path = require("path");

// ===== CONFIG =====
const ROLE_NAME = "Human ID Verified"; 
const SBT_CONTRACT = "0x2AA822e264F8cc31A2b9C22f39e5551241e94DfB";
const RPC_URL = "https://mainnet.optimism.io";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN not set");
  process.exit(1);
}

// ===== Discord Client =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== Express Server =====
const app = express();
app.use(express.static(path.join(__dirname, "public"))); // serve signer.html
app.get("/", (req, res) => res.send("SBT bot is alive"));
app.listen(3000, () => console.log("API running on port 3000"));

// ===== Challenge storage =====
const challenges = new Map();

// ===== Optimism provider =====
const provider = new ethers.JsonRpcProvider(RPC_URL);
const ABI = ["function balanceOf(address owner) view returns (uint256)"];

// ===== Bot Ready =====
client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

// ===== Message Handler =====
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // ---- Step 1: Start verification ----
  if (message.content === "!verify") {
    const challenge = `Verify Discord ${message.author.id}-${Date.now()}`;
    challenges.set(message.author.id, challenge);

    return message.reply(
      `✅ **Wallet Verification Started**\n\n` +
      `Sign this message with your wallet:\n\`${challenge}\`\n\n` +
      `Or use the signer page: https://role-tfws.onrender.com/signer.html?msg=${encodeURIComponent(challenge)}\n\n` +
      `Then reply with:\n!signature <your_signature>`
    );
  }

  // ---- Step 2: Signature submission ----
  if (message.content.startsWith("!signature")) {
    const args = message.content.split(" ");
    if (!args[1]) return message.reply("Send: `!signature <signature>`");

    const signature = args[1];
    const challenge = challenges.get(message.author.id);
    if (!challenge) return message.reply("Run !verify first.");

    let wallet;
    try {
      wallet = ethers.verifyMessage(challenge, signature);
    } catch (err) {
      return message.reply("❌ Invalid signature.");
    }

    // ---- Check SBT ownership ----
    try {
      const contract = new ethers.Contract(SBT_CONTRACT, ABI, provider);
      const balance = await contract.balanceOf(wallet);

      if (balance === 0n) return message.reply("❌ This wallet does not hold the Human ID SBT.");

      const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) return message.reply("Role not found on server.");

      const member = await message.guild.members.fetch(message.author.id);
      await member.roles.add(role);

      challenges.delete(message.author.id);

      return message.reply(`✅ Verified! Wallet: ${wallet}`);
    } catch (err) {
      console.error(err);
      return message.reply("Error checking SBT ownership.");
    }
  }
});

// ===== Login =====
client.login(token);
