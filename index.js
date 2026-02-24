const { Client, GatewayIntentBits, Partials } = require("discord.js");
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

// ENV VARIABLES
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const EMPLOYEE_ROLE_ID = process.env.EMPLOYEE_ROLE_ID;

// In-memory store (resets daily)
const responses = new Map();

/* ---------------- READY ---------------- */
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ---------------- 11:00 AM — START STANDUP ---------------- */
cron.schedule(
  "0 11 * * *",
  async () => {
    responses.clear();

    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();

    const employees = guild.members.cache.filter(
      m => m.roles.cache.has(EMPLOYEE_ROLE_ID) && !m.user.bot
    );

    for (const member of employees.values()) {
      try {
        const dm = await member.createDM();

        responses.set(member.id, {
          step: 1,
          data: {}
        });

        await dm.send(
          "👋 **Hello! I hope you are working well.**\n" +
          "**Keep the momentum going 🚀**\n\n" +
          "Please answer the following questions.\n\n" +
          "**1️⃣ Previous work day progress**"
        );
      } catch (err) {
        console.error(`❌ DM failed for ${member.user.tag}`);
      }
    }
  },
  { timezone: "Asia/Kathmandu" }
);

/* ---------------- COLLECT DM RESPONSES ---------------- */
client.on("messageCreate", async message => {
  if (message.guild || message.author.bot) return;

  const state = responses.get(message.author.id);
  if (!state) return;

  if (state.step === 1) {
    state.data.yesterday = message.content;
    state.step = 2;
    return message.channel.send(
      "**2️⃣ Plans for today**"
    );
  }

  if (state.step === 2) {
    state.data.today = message.content;
    state.step = 3;
    return message.channel.send(
      "**3️⃣ Blockers (reply `None` if no blockers)**"
    );
  }

  if (state.step === 3) {
    state.data.blockers = message.content;
    state.step = 4;
    return message.channel.send(
      "✅ **Thank you! Your standup has been recorded.**"
    );
  }
});

/* ---------------- 11:45 AM — POST STANDUPS ---------------- */
cron.schedule(
  "45 11 * * *",
  async () => {
    const channel = await client.channels.fetch(CHANNEL_ID);

    for (const [userId, entry] of responses.entries()) {
      if (!entry.data.yesterday || entry.step < 4) continue;

      const user = await client.users.fetch(userId);

      await channel.send(
        `📝 **Daily Standup — ${user.username}**\n\n` +
        `**Previous work day progress**\n${entry.data.yesterday}\n\n` +
        `**Plans for today**\n${entry.data.today}\n\n` +
        `**Blockers**\n${entry.data.blockers || "None"}`
      );
    }
  },
  { timezone: "Asia/Kathmandu" }
);

/* ---------------- 8:00 PM — REMINDER FOR MISSING STANDUPS ---------------- */
cron.schedule(
  "0 20 * * *",
  async () => {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();

    const employees = guild.members.cache.filter(
      m => m.roles.cache.has(EMPLOYEE_ROLE_ID) && !m.user.bot
    );

    for (const member of employees.values()) {
      const state = responses.get(member.id);

      // Did not submit
      if (!state || state.step < 4) {
        try {
          const dm = await member.createDM();
          await dm.send(
            "⚠️ **Reminder:** You did not submit your daily standup today.\n\n" +
            "Please make sure to update the team or inform your lead."
          );
        } catch (err) {
          console.error(`❌ Reminder DM failed for ${member.user.tag}`);
        }
      }
    }
  },
  { timezone: "Asia/Kathmandu" }
);

/* ---------------- LOGIN ---------------- */
client.login(BOT_TOKEN);
