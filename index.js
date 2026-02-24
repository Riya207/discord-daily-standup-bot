const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
  ],
  partials: ["CHANNEL"],
});

// 👇 PUT *YOUR* USER ID HERE
const TEST_USER_ID = "1105519295049498766";

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const user = await client.users.fetch(TEST_USER_ID);
    await user.send("👋 Hello Riya! Daily Standup Bot is working correctly.");
    console.log("✅ Test DM sent successfully");
  } catch (err) {
    console.error("❌ DM failed:", err);
  }
});

client.login(process.env.BOT_TOKEN);
