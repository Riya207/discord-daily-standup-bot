const { Client, GatewayIntentBits, Partials } = require("discord.js");
const cron = require("node-cron");

// ===============================
// CLIENT SETUP
// ===============================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const CHANNEL_ID = process.env.CHANNEL_ID;               // Standup channel
const HOLIDAY_CHANNEL_ID = process.env.HOLIDAY_CHANNEL_ID; // Holiday channel

// ===============================
// HOLIDAY CONFIG (ONE DAY PRIOR)
// ===============================
const HOLIDAYS = [
  { name: "Holi", date: "03-02", message: "Wishing you a joyful and colorful Holi. Enjoy the festival and take a refreshing break. 🌈" },
  { name: "Chaite Dashain", date: "03-26", message: "May this Chaite Dashain bring positivity and new beginnings. 🌸" },
  { name: "New Year", date: "04-14", message: "Wishing you a fresh start, new goals, and great success in the coming year. 🎊" },
  { name: "Buddha Jayanti", date: "05-01", message: "May Lord Buddha’s teachings bring peace, wisdom, and harmony to your life. ☸️" },
  { name: "Janai Purnima", date: "08-28", message: "Wishing you purity of thoughts and good health on Janai Purnima. 🙏" },
  { name: "Teej", date: "09-14", message: "Wishing happiness, strength, and well-being on the occasion of Teej. 🌺" },
  { name: "Ghatasthapana", date: "10-11", message: "Dashain begins! May this festive season bring joy and prosperity. 🪔" },

  { name: "Dashain Holidays", date: "10-18", message: "Dashain holidays begin. Enjoy the festive time with family and loved ones. 🎉" },
  { name: "Dashain Holidays", date: "10-19", message: "Wishing you continued joy and blessings during Dashain. 🎊" },
  { name: "Dashain Holidays", date: "10-20", message: "May Dashain bring success, happiness, and good fortune. 🌸" },
  { name: "Dashain Holidays", date: "10-21", message: "Warm wishes on Bijaya Dashami. May victory and prosperity be yours. 🌼" },

  { name: "Tihar Holidays", date: "11-08", message: "Tihar holidays begin. Wishing you light, happiness, and prosperity. 🪔" },
  { name: "Tihar Holidays", date: "11-09", message: "May Goddess Laxmi bless you with wealth and happiness. 🏮" },
  { name: "Tihar Holidays", date: "11-10", message: "Wishing joy and harmony on the festive days of Tihar. ✨" },
  { name: "Bhai Tika", date: "11-11", message: "Warm wishes on Bhai Tika. May sibling bonds grow stronger. 💙" },

  { name: "Christmas", date: "12-25", message: "Merry Christmas! Wishing you joy, peace, and warmth this festive season. 🎄" },
  { name: "Tamu Lhoshar / Poush 15", date: "12-30", message: "Happy Tamu Lhoshar. Wishing prosperity, health, and happiness. 🎉" },
  { name: "New Year", date: "01-01", message: "Happy New Year! Wishing success, growth, and happiness in the year ahead. 🎆" },

  { name: "Holi", date: "03-21", message: "May this Holi fill your life with colors of joy and positivity. 🌈" },
  { name: "Chaite Dashain", date: "04-13", message: "Wishing peace, prosperity, and happiness on Chaite Dashain. 🌼" }
];

// ===============================
// HELPERS
// ===============================
function getMMDD(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isTodayHoliday() {
  const today = getMMDD(0);
  return HOLIDAYS.some(h => h.date === today);
}

// ---- In-memory daily tracking ----
let standupStatus = {}; // { userId: { step, answers, submitted } }

function resetDailyStandup() {
  standupStatus = {};
  console.log("🔄 Daily standup reset");
}

// ===============================
// SEND STANDUP DM
// ===============================
async function sendDailyStandupDM() {
  const guilds = client.guilds.cache.values();

  for (const guild of guilds) {
    const members = await guild.members.fetch();

    for (const member of members.values()) {
      if (member.user.bot) continue;

      standupStatus[member.id] = {
        step: 1,
        answers: {},
        submitted: false,
      };

      try {
        await member.send(
          "👋 **Hello! I hope you are working well. Keep the momentum going.**\n\n" +
          "**Please answer the following questions (reply one by one):**\n\n" +
          "1️⃣ What did you work on yesterday?"
        );
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

  // 🔁 Manual resend (TODAY ONLY, respects holidays)
  if (process.env.RESEND_TODAY === "true" && !isTodayHoliday()) {
    await sendDailyStandupDM();
    console.log("⚠️ Standup resent manually. Disable RESEND_TODAY now.");
  }

  // 🕚 11:00 AM — Daily standup (SKIPPED on holidays)
  cron.schedule(
    "0 11 * * *",
    async () => {
      if (isTodayHoliday()) {
        console.log("🏖 Holiday today — standup skipped");
        return;
      }

      resetDailyStandup();
      await sendDailyStandupDM();
    },
    { timezone: "Asia/Kathmandu" }
  );

  // ⏰ 8:00 PM — Reminder (SKIPPED on holidays)
  cron.schedule(
    "0 20 * * *",
    async () => {
      if (isTodayHoliday()) return;

      for (const userId in standupStatus) {
        if (!standupStatus[userId].submitted) {
          try {
            const user = await client.users.fetch(userId);
            await user.send(
              "⚠️ **Reminder:** You have not submitted your daily standup.\n\n" +
              "Please complete it before **11:45 PM**."
            );
          } catch {}
        }
      }
    },
    { timezone: "Asia/Kathmandu" }
  );

  // 📣 5:00 PM — Holiday notice (ONE DAY BEFORE)
  cron.schedule(
    "0 17 * * *",
    async () => {
      const tomorrow = getMMDD(1);
      const channel = await client.channels.fetch(HOLIDAY_CHANNEL_ID);

      for (const holiday of HOLIDAYS) {
        if (holiday.date === tomorrow) {
          await channel.send(
            `📣 **Holiday Notice**\n\n` +
            `🗓 **Tomorrow is the holiday on the occasion of ${holiday.name}.**\n\n` +
            holiday.message
          );
        }
      }
    },
    { timezone: "Asia/Kathmandu" }
  );
});

// ===============================
// HANDLE DM REPLIES
// ===============================
client.on("messageCreate", async (message) => {
  if (message.guild) return;
  if (message.author.bot) return;

  const status = standupStatus[message.author.id];
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

    return message.reply("✅ **Thank you! Your daily standup has been submitted.**");
  }
});

client.login(process.env.BOT_TOKEN);
