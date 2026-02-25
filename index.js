const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cron = require("node-cron");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel], // REQUIRED for DMs
});

const CHANNEL_ID = process.env.CHANNEL_ID;

// ---- In-memory daily tracking ----
let standupStatus = {}; 
// { userId: { step, answers, submitted } }

function resetDailyStandup() {
  standupStatus = {};
  console.log("🔄 Daily standup reset");
}

// ===============================
// SEND STANDUP DM TO ALL EMPLOYEES
// ===============================
async function sendDailyStandupDM() {
  const guilds = client.guilds.cache.values();

  for (const guild of guilds) {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) continue;

      // initialize status only if not already done
      if (!standupStatus[member.id]) {
        standupStatus[member.id] = {
          step: 1,
          answers: {},
          submitted: false,
        };
      }

      try {
        await member.send(
          "👋 **Hello! I hope you are working well. Keep the momentum going.**\n\n" +
          "**Please answer the following questions (reply one by one):**\n\n" +
          "1️⃣ What did you work on yesterday?"
        );
        console.log(`✅ Standup DM sent to ${member.user.tag}`);
      } catch {
        console.log(`❌ DM failed for ${member.user.tag}`);
      }
    }
  }
}

// ===============================
// BOT READY
// ===============================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔁 ONE-TIME resend for TODAY only
  if (process.env.RESEND_TODAY === "true") {
    console.log("🔁 Manual resend triggered (today only)");
    await sendDailyStandupDM();
    console.log("⚠️ Set RESEND_TODAY=false after this");
  }

  // 🕚 11:00 AM — Daily standup start
  cron.schedule(
    "0 11 * * *",
    async () => {
      resetDailyStandup();
      await sendDailyStandupDM();
    },
    { timezone: "Asia/Kathmandu" }
  );

  // ⏰ 8:00 PM — Reminder ONLY if not submitted
  cron.schedule(
    "0 20 * * *",
    async () => {
      for (const userId in standupStatus) {
        const status = standupStatus[userId];
        if (!status.submitted) {
          try {
            const user = await client.users.fetch(userId);
            await user.send(
              "⚠️ **Reminder:** You have not submitted your daily standup today.\n\n" +
              "Please reply to complete it before **11:45 PM**."
            );
          } catch {}
        }
      }
    },
    { timezone: "Asia/Kathmandu" }
  );
});

// ===============================
// HANDLE DM REPLIES (NO EXPIRY)
// ===============================
client.on("messageCreate", async (message) => {
  if (message.guild) return;
  if (message.author.bot) return;

  const userId = message.author.id;
  const status = standupStatus[userId];
  if (!status || status.submitted) return;

  if (status.step === 1) {
    status.answers.yesterday = message.content;
    status.step = 2;
    return message.reply("2️⃣ What will you work on today?");
  }

  if (status.step === 2) {
    status.answers.today = message.content;
    status.step = 3;
    return message.reply("3️⃣ Any blockers?");
  }

  if (status.step === 3) {
    status.answers.blockers = message.content;
    status.submitted = true;

    const channel = await client.channels.fetch(CHANNEL_ID);

    await channel.send(
      `📝 **Daily Standup — ${message.author.username}**\n\n` +
      `**Previous work day progress**\n${status.answers.yesterday}\n\n` +
      `**Plans for today**\n${status.answers.today}\n\n` +
      `**Blockers (if any)**\n${status.answers.blockers}`
    );

    return message.reply(
      "✅ **Thank you! Your daily standup has been submitted successfully.**"
    );
  }
});

client.login(process.env.BOT_TOKEN);
