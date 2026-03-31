require("dotenv").config();
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const express = require("express");

const STATE_FILE = path.join(__dirname, "standup-state.json");

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
  // Use Asia/Kathmandu time consistently
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  d.setDate(d.getDate() + offset);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isTodayHoliday() {
  const today = getMMDD(0);
  return HOLIDAYS.some(h => h.date === today);
}

function isSaturday() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  return d.getDay() === 6; // 6 is Saturday
}

function isPastCutoff() {
  const cutoff = "23:45"; // Hardcoded cut-off time (11:45 PM Kathmandu)
  const [cutoffHour, cutoffMinute] = cutoff.split(":").map(Number);
  
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  if (currentHour > cutoffHour) return true;
  if (currentHour === cutoffHour && currentMinute >= cutoffMinute) return true;
  return false;
}

// ---- Persistent daily tracking ----
let standupStatus = loadState();

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (e) {
      console.error("❌ Error loading state:", e);
      return {};
    }
  }
  return {};
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(standupStatus, null, 2));
  } catch (e) {
    console.error("❌ Error saving state:", e);
  }
}

function resetDailyStandup() {
  standupStatus = {};
  saveState();
  console.log("🔄 Daily standup reset");
}

// ===============================
// SEND STANDUP DM
// ===============================
async function sendDailyStandupDM() {
  const guilds = client.guilds.cache.values();
  const processedUsers = new Set(); // To prevent duplicate DMs across guilds

  for (const guild of guilds) {
    let members;
    try {
      members = await guild.members.fetch();
    } catch (e) {
      console.error(`❌ Failed to fetch members for guild: ${guild.name}`, e);
      continue;
    }

    for (const member of members.values()) {
      if (member.user.bot || processedUsers.has(member.id)) continue;
      processedUsers.add(member.id);

      // Initialize status only if not already in a standup session for today
      if (!standupStatus[member.id]) {
        standupStatus[member.id] = {
          step: 1,
          answers: {},
          submitted: false,
          promptSent: false, // Track if we've sent the initial prompt
        };
      } else if (standupStatus[member.id].submitted || standupStatus[member.id].promptSent) {
        // If they already submitted or already received the prompt, skip them
        continue;
      }

      try {
        await member.send(
          "👋 **Hello! I hope you are working well. Keep the momentum going.**\n\n" +
          "**Please answer the following questions (reply one by one):**\n\n" +
          "1️⃣ What did you work on yesterday?"
        );
        standupStatus[member.id].promptSent = true;
      } catch {
        console.log(`❌ DM failed for ${member.user.tag} (probably DMs disabled)`);
      }
    }
  }
  saveState();
}

// ===============================
// BOT READY
// ===============================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // 🔁 Manual resend (TODAY ONLY)
  if (process.env.RESEND_TODAY === "true") {
    if (isTodayHoliday() || isSaturday()) {
      console.log("🏖 Holiday or Saturday today — Standup skipped even for manual resend.");
    } else {
      await sendDailyStandupDM();
      console.log("⚠️ Standup resent manually. Disable RESEND_TODAY now.");
    }
  }

  // 🕚 11:00 AM — Daily standup (SKIPPED on holidays/Saturdays)
  cron.schedule(
    "0 11 * * *",
    async () => {
      if (isTodayHoliday() || isSaturday()) {
        console.log("🏖 Holiday or Saturday today — Standup skipped.");
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
  if (!status) return;

  // 📝 Handle '/edit' command (restarts standup even if submitted)
  if (message.content.toLowerCase().trim() === "/edit") {
    status.step = 1;
    status.answers = {};
    status.submitted = false; // Allow re-submission
    saveState();
    return message.reply("🔄 **Restarting your standup...**\n\n1️⃣ What did you work on yesterday?");
  }

  if (status.submitted) return;

  // Max message length to prevent Discord API errors
  const userMessage = message.content.slice(0, 1500);

  if (status.step === 1) {
    status.answers.yesterday = userMessage;
    status.step = 2;
    saveState();
    return message.reply("2️⃣ What will you work on today?");
  }

  if (status.step === 2) {
    status.answers.today = userMessage;
    status.step = 3;
    saveState();
    return message.reply("3️⃣ Any blockers?");
  }

  if (status.step === 3) {
    status.answers.blockers = userMessage;
    status.step = 4; // Confirmation step
    saveState();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_standup")
        .setLabel("✅ Confirm and Submit")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("edit_standup")
        .setLabel("✏️ Edit All")
        .setStyle(ButtonStyle.Secondary)
    );

    const summary = 
      `📝 **Review your Daily Standup**\n\n` +
      `**1️⃣ Yesterday:**\n${status.answers.yesterday}\n\n` +
      `**2️⃣ Today:**\n${status.answers.today}\n\n` +
      `**3️⃣ Blockers:**\n${status.answers.blockers}\n\n` +
      `*Click a button below to proceed.*`;

    return message.reply({ content: summary, components: [row] });
  }
});

// ===============================
// HANDLE BUTTON INTERACTIONS
// ===============================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const status = standupStatus[interaction.user.id];
  if (!status || status.submitted || status.step !== 4) {
    return interaction.reply({ content: "⚠️ This session has expired or already been submitted.", ephemeral: true });
  }

  if (interaction.customId === "edit_standup") {
    status.step = 1;
    status.answers = {};
    saveState();
    await interaction.update({ content: "🔄 **Restarting your standup...**", components: [] });
    return interaction.followUp("1️⃣ What did you work on yesterday?");
  }

  if (interaction.customId === "confirm_standup") {
    try {
      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel) throw new Error("Could not find the standup channel.");

      const isLate = isPastCutoff();
      
      const embed = new EmbedBuilder()
        .setColor(isLate ? "#e74c3c" : "#3498db") // Red if late, Blue if normal (matches screenshot)
        .setAuthor({ 
          name: interaction.user.username, 
          iconURL: interaction.user.displayAvatarURL() 
        })
        .setTitle("Here is an update for Daily Standup check-in:")
        .addFields(
          { name: "Previous work day progress", value: status.answers.yesterday },
          { name: "Plans for today", value: status.answers.today },
          { name: "Blockers (if any)", value: status.answers.blockers }
        )
        .setTimestamp();

      // If a message was already posted today, edit it. Otherwise, send a new one.
      if (status.reportMessageId) {
        try {
          const oldMessage = await channel.messages.fetch(status.reportMessageId);
          await oldMessage.edit({ embeds: [embed] });
        } catch (e) {
          // If the message was deleted, just send a new one
          const sentMessage = await channel.send({ embeds: [embed] });
          status.reportMessageId = sentMessage.id;
        }
      } else {
        const sentMessage = await channel.send({ embeds: [embed] });
        status.reportMessageId = sentMessage.id;
      }

      status.submitted = true;
      saveState();

      return interaction.update({
        content: "✅ **Thank you! Your daily standup has been submitted to the team channel.**\n\n*If you missed anything, type `/edit` to resubmit and update your report.*",
        components: []
      });
    } catch (e) {
      console.error("❌ Failed to send standup to channel:", e);
      return interaction.reply({ 
        content: "⚠️ **Error:** I couldn't post your standup to the team channel. Please contact an admin.",
        ephemeral: true 
      });
    }
  }
});

client.login(process.env.BOT_TOKEN);

// ===============================
// KEEP-ALIVE SERVER (For Render Free Tier)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🚀 Daily Standup Bot is online and healthy!");
});

app.listen(PORT, () => {
  console.log(`📡 Keep-alive server listening on port ${PORT}`);
});
