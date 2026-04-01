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
  partials: [Partials.Channel, Partials.Message],
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
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // 🔴 LATE: If it is after 11:45 PM (23:45)
  if (currentHour === 23 && currentMinute >= 45) return true;

  // 🔴 ALSO LATE: If it is after midnight (00:00) but before the 11:00 AM reset
  if (currentHour < 11) return true;

  // 🔵 ON-TIME: Anytime between the 11:00 AM reset and 11:45 PM
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
        console.log(`📡 DM prompt sent to: ${member.user.tag}`);
      } catch (err) {
        console.log(`❌ DM failed for ${member.user.tag} (DMs might be disabled)`);
      }
    }
  }
  saveState();
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📡 Connected to Standup Channel: ${CHANNEL_ID}`);
  console.log(`📡 Connected to Holiday Channel: ${HOLIDAY_CHANNEL_ID}`);

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
        console.log("🏖 Today is a Holiday or Saturday — Skipping daily standup distribution.");
        return;
      }
      
      console.log("🕚 11:00 AM — Starting daily standup distribution...");
      resetDailyStandup();
      await sendDailyStandupDM();
      console.log("✅ Daily standup distribution complete.");
    },
    { timezone: "Asia/Kathmandu" }
  );

  // ⏰ 8:00 PM — Reminder (SKIPPED on holidays)
  cron.schedule(
    "0 20 * * *",
    async () => {
      if (isTodayHoliday()) return;
      console.log("⏰ 8:00 PM — Sending reminders to users who haven't submitted...");
      let reminderCount = 0;
      for (const userId in standupStatus) {
        if (!standupStatus[userId].submitted) {
          try {
            const user = await client.users.fetch(userId);
            await user.send(
              "⚠️ **Reminder:** You have not submitted your daily standup.\n\n" +
              "Please complete it before **11:45 PM**."
            );
            reminderCount++;
          } catch (err) {
            console.log(`❌ Failed to send reminder to User ID ${userId}`);
          }
        }
      }
      console.log(`✅ Sent ${reminderCount} reminders.`);
    },
    { timezone: "Asia/Kathmandu" }
  );

  // 📣 5:00 PM — Holiday notice (ONE DAY BEFORE)
  cron.schedule(
    "0 17 * * *",
    async () => {
      try {
        const tomorrow = getMMDD(1);
        const channel = await client.channels.fetch(HOLIDAY_CHANNEL_ID);
        if (!channel) return;

        for (const holiday of HOLIDAYS) {
          if (holiday.date === tomorrow) {
            await channel.send(
              `📣 **Holiday Notice**\n\n` +
              `🗓 **Tomorrow is the holiday on the occasion of ${holiday.name}.**\n\n` +
              holiday.message
            );
            console.log(`📣 Holiday notice sent for ${holiday.name}`);
          }
        }
      } catch (err) {
        console.error("❌ Failed to send holiday notice:", err);
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

  console.log(`📩 DM Received from ${message.author.username}: "${message.content}"`);

  const userMessageContent = message.content.toLowerCase().trim();

  // 📝 Handle '/edit' command (restarts or initializes standup even if state was lost)
  if (userMessageContent === "/edit") {
    standupStatus[message.author.id] = {
      step: 1,
      answers: {},
      submitted: false,
      promptSent: true
    };
    saveState();
    return message.reply("🔄 **Restarting your standup...**\n\n1️⃣ What did you work on yesterday?");
  }

  let status = standupStatus[message.author.id];

  // 🛠 AUTO-RECOVER: If the bot restarted and lost its memory, 
  // initialize the user back to Step 1 so the conversation continues.
  if (!status) {
    status = {
      step: 1,
      answers: {},
      submitted: false,
      promptSent: true,
    };
    standupStatus[message.author.id] = status;
    saveState();
    console.log(`🛠️ Auto-Recovery: Initialized new session for ${message.author.tag} after restart.`);
  }

  if (status.submitted) {
    console.log(`📩 Ignoring message from ${message.author.tag} (Already submitted)`);
    return;
  }

  // Max message length to prevent Discord API errors
  const userMessage = message.content.slice(0, 1500);

  if (status.step === 1) {
    status.answers.yesterday = userMessage;
    status.step = 2;
    saveState();
    console.log(`📝 ${message.author.username} completed Step 1 (Yesterday)`);
    return message.reply("2️⃣ What will you work on today?");
  } else if (status.step === 2) {
    status.answers.today = userMessage;
    status.step = 3;
    saveState();
    console.log(`📝 ${message.author.username} completed Step 2 (Today)`);
    return message.reply("3️⃣ Any blockers?");
  } else if (status.step === 3) {
    status.answers.blockers = userMessage;
    status.step = 4; // Confirmation step
    saveState();
    console.log(`📝 ${message.author.username} completed Step 3 (Blockers)`);

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
      `🚨 **ACTION REQUIRED: NOT SUBMITTED YET!**\n\n` +
      `📝 **Review your Daily Standup**\n\n` +
      `**1️⃣ Yesterday:**\n${status.answers.yesterday}\n\n` +
      `**2️⃣ Today:**\n${status.answers.today}\n\n` +
      `**3️⃣ Blockers:**\n${status.answers.blockers}\n\n` +
      `👉 **Please click the button below to post this to the team channel!**`;

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
    console.log(`⚠️ Button clicked but session expired/invalid for ${interaction.user.tag}`);
    return interaction.reply({ content: "⚠️ This session has expired or already been submitted.", ephemeral: true });
  }

  console.log(`🔘 Button clicked: "${interaction.customId}" by ${interaction.user.tag}`);

  if (interaction.customId === "edit_standup") {
    status.step = 1;
    status.answers = {};
    saveState();
    console.log(`✏️ ${interaction.user.tag} clicked "Edit All" - Restarting their standup.`);
    await interaction.update({ content: "🔄 **Restarting your standup...**", components: [] });
    return interaction.followUp("1️⃣ What did you work on yesterday?");
  }

  if (interaction.customId === "confirm_standup") {
    try {
      // ⏳ Defer the update immediately to prevent "Interaction timed out" 
      // while we perform the async auto-discovery search
      await interaction.deferUpdate();

      const channel = await client.channels.fetch(CHANNEL_ID);
      if (!channel) throw new Error("Could not find the standup channel.");

      console.log(`📡 Submitting to channel: #${channel.name || "Private/Unknown"} (${channel.id})`);

      const isLate = isPastCutoff();
      const color = isLate ? "#e74c3c" : "#3498db";

      const content = "Here is an update for **Daily Standup** check-in:";

      const embed1 = new EmbedBuilder()
        .setColor(color)
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.displayAvatarURL()
        })
        .setTitle("Previous work day progress")
        .setDescription(status.answers.yesterday);

      const embed2 = new EmbedBuilder()
        .setColor(color)
        .setTitle("Plans for today")
        .setDescription(status.answers.today);

      const embed3 = new EmbedBuilder()
        .setColor(color)
        .setTitle("Blockers (if any)")
        .setDescription(status.answers.blockers || "*No blockers reported*");

      const embeds = [embed1, embed2, embed3];

      // 🕵️‍♂️ Auto-Discovery Fallback: If memory is empty (after restart), search the channel for a previous report
      if (!status.reportMessageId) {
        console.log(`🕵️‍♂️ Auto-Discovery: Memory is empty for ${interaction.user.tag}. Searching today's history...`);
        try {
          const todayMMDD = getMMDD(0);
          const fetchedMessages = await channel.messages.fetch({ limit: 50 });
          const previousReport = fetchedMessages.find(m => {
            const d = new Date(new Date(m.createdAt).toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
            const msgMMDD = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            
            return (
              m.author.id === client.user.id &&
              m.embeds.length > 0 &&
              m.embeds[0].author?.name === interaction.user.username &&
              msgMMDD === todayMMDD // 🛡️ ONLY discover reports from TODAY
            );
          });

          if (previousReport) {
            console.log(`🕵️‍♂️ Auto-Discovery SUCCESS: Found today's report (${previousReport.id}) for ${interaction.user.tag}`);
            status.reportMessageId = previousReport.id;
          } else {
            console.log(`🕵️‍♂️ Auto-Discovery: No report found for ${interaction.user.tag} in today's channel history.`);
          }
        } catch (err) {
          console.error("❌ Error during Auto-Discovery search:", err);
        }
      }

      // If a message was already posted today, edit it. Otherwise, send a new one.
      if (status.reportMessageId) {
        try {
          console.log(`📝 Updating existing report (${status.reportMessageId}) for ${interaction.user.tag}`);
          const oldMessage = await channel.messages.fetch(status.reportMessageId);
          await oldMessage.edit({ content, embeds });
        } catch (e) {
          console.log(`⚠️ Previous report (${status.reportMessageId}) could not be edited (maybe deleted). Sending new one.`);
          const sentMessage = await channel.send({ content, embeds });
          status.reportMessageId = sentMessage.id;
        }
      } else {
        console.log(`📝 Sending NEW report for ${interaction.user.tag}`);
        const sentMessage = await channel.send({ content, embeds });
        status.reportMessageId = sentMessage.id;
      }

      status.submitted = true;
      saveState();

      console.log(`✅ Standup successfully SUBMITTED to channel for: ${interaction.user.tag}`);

      // Use editReply because we deferred earlier
      return interaction.editReply({
        content: "✅ **Thank you! Your daily standup has been submitted to the team channel.**\n\n*If you missed anything, type `/edit` to resubmit and update your report.*",
        components: []
      });
    } catch (e) {
      console.error("❌ Failed to send standup to channel:", e);
      return interaction.editReply({
        content: "⚠️ **Error:** I couldn't post your standup to the team channel. Please contact an admin.",
        components: []
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
