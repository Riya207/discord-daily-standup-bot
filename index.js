const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const CHANNEL_ID = process.env.CHANNEL_ID;

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);

  cron.schedule(
    "0 10 * * *",
    async () => {
      const channel = await client.channels.fetch(CHANNEL_ID);
      channel.send(
        "🌅 **Daily Standup**\n\n" +
        "1️⃣ What did you work on yesterday?\n" +
        "2️⃣ What will you work on today?\n" +
        "3️⃣ Any blockers?"
      );
    },
    { timezone: "Asia/Kathmandu" }
  );
});

client.login(process.env.BOT_TOKEN);
