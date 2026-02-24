const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Partials,
} = require("discord.js");
const cron = require("node-cron");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const {
  BOT_TOKEN,
  GUILD_ID,
  CHANNEL_ID,
  EMPLOYEE_ROLE_ID,
} = process.env;

// 🕒 Nepal Time (Asia/Kathmandu)
const TIMEZONE = "Asia/Kathmandu";

// Track daily submissions
let submittedToday = new Set();

/* ---------------- BOT READY ---------------- */
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ---------------- 11:00 AM — START STANDUP ---------------- */
cron.schedule(
  "15 5 * * 1-5", // 11:00 AM NPT
  async () => {
    console.log("🟢 Starting daily standup");

    submittedToday.clear();

    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const employees = members.filter(
      (m) => m.roles.cache.has(EMPLOYEE_ROLE_ID) && !m.user.bot
    );

    for (const member of employees.values()) {
      try {
        const dm = await member.createDM();

        // Greeting
        await dm.send(
          "**Hello! 👋**\n" +
          "I hope you are working well.\n" +
          "**Keep the momentum going 🚀**\n\n" +
          "Please answer the following questions clearly."
        );

        const questions = [
          "🟦 **Previous work day progress**",
          "🟦 **Plans for today**",
          "🟥 **Blockers (if any)**",
        ];

        const answers = [];

        for (const question of questions) {
          await dm.send(question);

          const filter = (m) => m.author.id === member.user.id;

          const collected = await dm.awaitMessages({
            filter,
            max: 1,
            time: 15 * 60 * 1000, // waits but window closes at 11:45
          });

          answers.push(collected.first().content);
        }

        // Mark as submitted
        submittedToday.add(member.user.id);

        const embed = new EmbedBuilder()
          .setAuthor({
            name: member.user.username,
            iconURL: member.user.displayAvatarURL(),
          })
          .setColor("#2563eb")
          .addFields(
            {
              name: "Previous work day progress",
              value: answers[0],
            },
            {
              name: "Plans for today",
              value: answers[1],
            },
            {
              name: "Blockers",
              value: answers[2] || "No blockers",
            }
          )
          .setTimestamp();

        const channel = await client.channels.fetch(CHANNEL_ID);
        await channel.send({ embeds: [embed] });

        await dm.send("✅ Standup submitted successfully. Thank you!");

      } catch (err) {
        console.error(`❌ Standup failed for ${member.user.username}`, err);
      }
    }
  },
  { timezone: TIMEZONE }
);

/* ---------------- 11:30 AM — REMINDER ---------------- */
cron.schedule(
  "45 5 * * 1-5", // 11:30 AM NPT
  async () => {
    console.log("🔔 Sending standup reminders");

    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const employees = members.filter(
      (m) => m.roles.cache.has(EMPLOYEE_ROLE_ID) && !m.user.bot
    );

    for (const member of employees.values()) {
      if (submittedToday.has(member.user.id)) continue;

      try {
        const dm = await member.createDM();
        await dm.send(
          "⏰ **Reminder:** Please complete your daily standup before **11:45 AM**."
        );
      } catch (err) {
        console.log(`❌ Could not remind ${member.user.username}`);
      }
    }
  },
  { timezone: TIMEZONE }
);

/* ---------------- 11:45 AM — CLOSE WINDOW ---------------- */
cron.schedule(
  "0 6 * * 1-5", // 11:45 AM NPT
  async () => {
    console.log("🔴 Standup window closed for today");
    submittedToday.clear();
  },
  { timezone: TIMEZONE }
);

client.login(BOT_TOKEN);
