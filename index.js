const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const cron = require("node-cron");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const EMPLOYEE_ROLE_ID = process.env.EMPLOYEE_ROLE_ID;

const submissions = new Map(); // userId → true

// ---------- Standup Flow ----------
async function startStandup(user) {
  await user.send(
    "👋 **Hello! I hope you are working well. Keep the momentum going.**\n\n" +
    "**Please answer the following questions:**"
  );

  const questions = [
    "1️⃣ What did you work on yesterday?",
    "2️⃣ What will you work on today?",
    "3️⃣ Any blockers?"
  ];

  const answers = [];

  for (const q of questions) {
    await user.send(q);
    const collected = await user.dmChannel.awaitMessages({
      max: 1,
      time: 15 * 60 * 1000
    });

    if (!collected.size) {
      await user.send("⏰ Time expired. Please inform your lead.");
      return;
    }

    answers.push(collected.first().content);
  }

  submissions.set(user.id, true);

  const channel = await client.channels.fetch(CHANNEL_ID);
  channel.send(
    `📝 **Daily Standup — ${user.username}**\n\n` +
    `**Previous work day progress**\n${answers[0]}\n\n` +
    `**Plans for today**\n${answers[1]}\n\n` +
    `**Blockers**\n${answers[2]}`
  );

  await user.send("✅ Thank you! Your daily standup has been submitted.");
}

// ---------- Bot Ready ----------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);

  // 11:00 AM — Start standup
  cron.schedule("0 11 * * *", async () => {
    submissions.clear();
    const members = await guild.members.fetch();

    members.forEach(member => {
      if (!member.user.bot && member.roles.cache.has(EMPLOYEE_ROLE_ID)) {
        startStandup(member.user);
      }
    });
  }, { timezone: "Asia/Kathmandu" });

  // 8:00 PM — Reminder with CTA
  cron.schedule("0 20 * * *", async () => {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (
        !member.user.bot &&
        member.roles.cache.has(EMPLOYEE_ROLE_ID) &&
        !submissions.has(member.id)
      ) {
        const button = new ButtonBuilder()
          .setCustomId("fill_standup")
          .setLabel("📝 Fill Daily Standup")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await member.user.send({
          content:
            "⚠️ **Reminder:** You did not submit your daily standup today.\n\n" +
            "Click below to submit now:",
          components: [row]
        });
      }
    }
  }, { timezone: "Asia/Kathmandu" });
});

// ---------- Button Interaction ----------
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "fill_standup") {
    await interaction.reply({
      content: "✅ Starting your daily standup now…",
      ephemeral: true
    });

    startStandup(interaction.user);
  }
});

client.login(BOT_TOKEN);
