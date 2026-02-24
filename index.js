const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const CHANNEL_ID = process.env.CHANNEL_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

// 👇 YOUR USER ID (same as before)
const TEST_USER_ID = "1105519295049498766";

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const user = await client.users.fetch(TEST_USER_ID);
  const dm = await user.createDM();

  const questions = [
    "🟦 **Previous work day progress**",
    "🟦 **Plans for today**",
    "🟥 **Blockers (if any)**",
  ];

  const answers = [];

  for (const q of questions) {
    await dm.send(q);

    const collected = await dm.awaitMessages({
      max: 1,
      time: 10 * 60 * 1000,
    });

    answers.push(collected.first().content);
  }

  const embed = new EmbedBuilder()
    .setTitle("🧾 Daily Standup — Riya Sunar")
    .addFields(
      { name: "Previous work day progress", value: answers[0] },
      { name: "Plans for today", value: answers[1] },
      { name: "Blockers", value: answers[2] || "No blockers" }
    )
    .setTimestamp();

  const channel = await client.channels.fetch(CHANNEL_ID);
  await channel.send({ embeds: [embed] });

  await dm.send("✅ Standup submitted successfully. Thank you!");
});

client.login(BOT_TOKEN);
