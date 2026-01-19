const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require("discord.js");
const express = require("express");
const { ethers } = require("ethers");
const path = require("path");

// ================= CONFIG =================
const ROLE_NAME = "Human ID Verified";
const SBT_CONTRACT = "0x2AA822e264F8cc31A2b9C22f39e5551241e94DfB";
const RPC_URL = "https://mainnet.optimism.io";

// ================= TOKEN =================
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN not set");
  process.exit(1);
}

// ================= CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ================= EXPRESS =================
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.send("SBT verifier bot running"));
app.listen(3000, () => console.log("API running on port 3000"));

// ================= STORAGE =================
const challenges = new Map();

// ================= PROVIDER =================
const provider = new ethers.JsonRpcProvider(RPC_URL);
const ABI = ["function balanceOf(address owner) view returns (uint256)"];

// ================= READY =================
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ================= HANDLER =================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  console.log("MESSAGE:", message.content);

  // ---- TEST ----
  if (message.content === "!ping") {
    return message.reply("pong ✅");
  }

  // ---- VERIFY ----
  if (message.content === "!verify") {
    const challenge = `Verify Discord ${message.author.id}-${Date.now()}`;
    challenges.set(message.author.id, challenge);

    try {
      const channel = await message.guild.channels.create({
        name: `verify-${message.author.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: message.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: message.author.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
      });

      await channel.send(
        `✅ **Wallet Verification Started**\n\n` +
        `Sign this message:\n\`${challenge}\`\n\n` +
        `Signer page:\nhttps://role-tfws.onrender.com/signer.html?msg=${encodeURIComponent(challenge)}\n\n` +
        `Then reply:\n\`!signature <signature>\``
      );

      setTimeout(async () => {
        if (challenges.has(message.author.id)) {
          challenges.delete(message.author.id);
          channel.delete().catch(() => {});
        }
      }, 10 * 60 * 1000);
    } catch (err) {
      console.error("CHANNEL ERROR:", err);
      message.reply("❌ Bot lacks permissions to create channels.");
    }
  }

  // ---- SIGNATURE ----
  if (message.content.startsWith("!signature")) {
    const args = message.content.split(" ");
    if (!args[1]) return message.reply("Use: `!signature <signature>`");

    const signature = args[1];
    const challenge = challenges.get(message.author.id);
    if (!challenge) return message.reply("Run `!verify` first.");

    let wallet;
    try {
      wallet = ethers.verifyMessage(challenge, signature);
    } catch {
      return message.reply("❌ Invalid signature.");
    }

    try {
      const contract = new ethers.Contract(SBT_CONTRACT, ABI, provider);
      const balance = await contract.balanceOf(wallet);

      if (balance === 0n) {
        return message.reply("❌ Wallet does not hold Human ID SBT.");
      }

      const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) return message.reply("Role not found.");

      const member = await message.guild.members.fetch(message.author.id);
      await member.roles.add(role);

      challenges.delete(message.author.id);

      if (message.channel.name.startsWith("verify-")) {
        await message.channel.delete();
      }

      return message.reply(`✅ Verified: ${wallet}`);
    } catch (err) {
      console.error("VERIFY ERROR:", err);
      return message.reply("❌ Verification error.");
    }
  }
});

// ================= LOGIN =================
client.login(token);
