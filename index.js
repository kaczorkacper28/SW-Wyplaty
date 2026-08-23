require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

// ======================================================
// KONFIGURACJA
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const UNB_API_TOKEN = process.env.UNB_API_TOKEN;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID || !UNB_API_TOKEN) {
    console.error("❌ Brakuje zmiennych w .env!");
    console.error("");
    console.error("Wymagane:");
    console.error("DISCORD_TOKEN=...");
    console.error("CLIENT_ID=...");
    console.error("GUILD_ID=...");
    console.error("UNB_API_TOKEN=...");
    process.exit(1);
}

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ======================================================
// UNBELIEVABOAT API
// ======================================================

const UNB_BASE_URL = "https://unbelievaboat.com/api/v1";

/**
 * Uniwersalne zapytanie do API UnbelievaBoat
 */
async function unbRequest(endpoint, options = {}) {
    const response = await fetch(`${UNB_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            "Authorization": UNB_API_TOKEN,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const text = await response.text();

    let data;

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = text;
    }

    if (!response.ok) {
        throw new Error(
            `UnbelievaBoat API ${response.status}: ${
                typeof data === "string"
                    ? data
                    : JSON.stringify(data)
            }`
        );
    }

    return data;
}

// ======================================================
// POBIERANIE SALDA
// ======================================================

async function getBalance(userId) {
    return await unbRequest(
        `/guilds/${GUILD_ID}/users/${userId}`
    );
}

// ======================================================
// DODAWANIE PIENIĘDZY
// ======================================================

async function addMoney(userId, amount, reason) {
    return await unbRequest(
        `/guilds/${GUILD_ID}/users/${userId}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                cash: amount,
                reason: reason
            })
        }
    );
}

// ======================================================
// ODEJMOWANIE PIENIĘDZY
// ======================================================

async function removeMoney(userId, amount, reason) {
    return await unbRequest(
        `/guilds/${GUILD_ID}/users/${userId}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                cash: -amount,
                reason: reason
            })
        }
    );
}

// ======================================================
// KOMENDY
// ======================================================

const commands = [

    // --------------------------------------------------
    // /sw-wyplata
    // --------------------------------------------------

    new SlashCommandBuilder()
        .setName("sw-wyplata")
        .setDescription("Wypłać funkcjonariuszowi pieniądze")
        .addUserOption(option =>
            option
                .setName("osoba")
                .setDescription("Funkcjonariusz otrzymujący wypłatę")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("kwota")
                .setDescription("Kwota wypłaty")
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("powod")
                .setDescription("Powód wypłaty")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    // --------------------------------------------------
    // /sw-saldo
    // --------------------------------------------------

    new SlashCommandBuilder()
        .setName("sw-saldo")
        .setDescription("Sprawdź saldo funkcjonariusza")
        .addUserOption(option =>
            option
                .setName("osoba")
                .setDescription("Osoba")
                .setRequired(true)
        ),

    // --------------------------------------------------
    // /sw-zabierz
    // --------------------------------------------------

    new SlashCommandBuilder()
        .setName("sw-zabierz")
        .setDescription("Zabierz funkcjonariuszowi pieniądze")
        .addUserOption(option =>
            option
                .setName("osoba")
                .setDescription("Osoba")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("kwota")
                .setDescription("Kwota do zabrania")
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("powod")
                .setDescription("Powód")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    // --------------------------------------------------
    // /sw-test
    // --------------------------------------------------

    new SlashCommandBuilder()
        .setName("sw-test")
        .setDescription("Sprawdź połączenie z API UnbelievaBoat")
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        )

].map(command => command.toJSON());

// ======================================================
// REJESTRACJA KOMEND
// ======================================================

async function registerCommands() {

    const rest = new REST({
        version: "10"
    }).setToken(DISCORD_TOKEN);

    try {

        console.log("🔄 Rejestrowanie komend SW...");

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("✅ Komendy SW zostały zarejestrowane!");

    } catch (error) {

        console.error(
            "❌ Błąd rejestracji komend:",
            error
        );

    }
}

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {

    console.log("");
    console.log("====================================");
    console.log("🟢 BOT SW URUCHOMIONY");
    console.log("====================================");
    console.log(`🤖 Konto: ${client.user.tag}`);
    console.log(`🏛️ Serwer: ${GUILD_ID}`);
    console.log("💰 UnbelievaBoat API: AKTYWNE");
    console.log("====================================");
    console.log("");

});

// ======================================================
// INTERAKCJE
// ======================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    // ==================================================
    // /sw-test
    // ==================================================

    if (interaction.commandName === "sw-test") {

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            const guild = await unbRequest(
                `/guilds/${GUILD_ID}`
            );

            const embed = new EmbedBuilder()
                .setTitle("🟢 Połączenie prawidłowe")
                .setDescription(
                    "BOT SW prawidłowo połączył się z API UnbelievaBoat."
                )
                .addFields(
                    {
                        name: "🏛️ Serwer",
                        value: guild.name || GUILD_ID,
                        inline: false
                    },
                    {
                        name: "💰 API",
                        value: "Połączone",
                        inline: true
                    },
                    {
                        name: "🤖 BOT SW",
                        value: "Online",
                        inline: true
                    }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply(
                `❌ Nie udało się połączyć z API.\n\n\`${error.message}\``
            );
        }

        return;
    }

    // ==================================================
    // /sw-saldo
    // ==================================================

    if (interaction.commandName === "sw-saldo") {

        await interaction.deferReply({
            ephemeral: true
        });

        const user = interaction.options.getUser("osoba");

        try {

            const balance = await getBalance(user.id);

            const cash = balance.cash ?? 0;
            const bank = balance.bank ?? 0;
            const total = balance.total ?? cash + bank;

            const embed = new EmbedBuilder()
                .setTitle("💰 Saldo funkcjonariusza")
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    {
                        name: "👤 Funkcjonariusz",
                        value: `${user}`,
                        inline: false
                    },
                    {
                        name: "💵 Gotówka",
                        value: `${cash}$`,
                        inline: true
                    },
                    {
                        name: "🏦 Bank",
                        value: `${bank}$`,
                        inline: true
                    },
                    {
                        name: "💰 Łącznie",
                        value: `${total}$`,
                        inline: true
                    }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply(
                `❌ Nie udało się pobrać salda.\n\n\`${error.message}\``
            );
        }

        return;
    }

    // ==================================================
    // /sw-wyplata
    // ==================================================

    if (interaction.commandName === "sw-wyplata") {

        await interaction.deferReply();

        const user = interaction.options.getUser("osoba");
        const amount = interaction.options.getInteger("kwota");
        const reason =
            interaction.options.getString("powod")
            || "Wypłata Służby Więziennej";

        try {

            // Pobieramy stare saldo
            const before = await getBalance(user.id);

            // Dodajemy pieniądze
            const result = await addMoney(
                user.id,
                amount,
                `${reason} | Wystawił: ${interaction.user.tag}`
            );

            const cashBefore = before.cash ?? 0;
            const cashAfter = result.cash ?? cashBefore + amount;

            const embed = new EmbedBuilder()
                .setTitle("💰 WYPŁATA SŁUŻBY WIĘZIENNEJ")
                .setDescription(
                    `Pomyślnie wypłacono pieniądze funkcjonariuszowi ${user}.`
                )
                .addFields(
                    {
                        name: "👤 Odbiorca",
                        value: `${user}`,
                        inline: false
                    },
                    {
                        name: "💵 Wypłata",
                        value: `+${amount}$`,
                        inline: true
                    },
                    {
                        name: "💰 Gotówka po wypłacie",
                        value: `${cashAfter}$`,
                        inline: true
                    },
                    {
                        name: "📋 Powód",
                        value: reason,
                        inline: false
                    },
                    {
                        name: "👮 Wypłacił",
                        value: `${interaction.user}`,
                        inline: false
                    }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({
                    text: "Służba Więzienna • System wypłat"
                });

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply(
                `❌ Wypłata nie została wykonana.\n\n\`${error.message}\``
            );
        }

        return;
    }

    // ==================================================
    // /sw-zabierz
    // ==================================================

    if (interaction.commandName === "sw-zabierz") {

        await interaction.deferReply();

        const user = interaction.options.getUser("osoba");
        const amount = interaction.options.getInteger("kwota");

        const reason =
            interaction.options.getString("powod")
            || "Potrącenie Służby Więziennej";

        try {

            const before = await getBalance(user.id);

            const result = await removeMoney(
                user.id,
                amount,
                `${reason} | Wystawił: ${interaction.user.tag}`
            );

            const cashBefore = before.cash ?? 0;
            const cashAfter = result.cash ?? cashBefore - amount;

            const embed = new EmbedBuilder()
                .setTitle("💸 POTRĄCENIE")
                .setDescription(
                    `Pobrano pieniądze od ${user}.`
                )
                .addFields(
                    {
                        name: "👤 Osoba",
                        value: `${user}`,
                        inline: false
                    },
                    {
                        name: "💸 Potrącono",
                        value: `-${amount}$`,
                        inline: true
                    },
                    {
                        name: "💰 Gotówka po potrąceniu",
                        value: `${cashAfter}$`,
                        inline: true
                    },
                    {
                        name: "📋 Powód",
                        value: reason,
                        inline: false
                    },
                    {
                        name: "👮 Wykonał",
                        value: `${interaction.user}`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: "Służba Więzienna • System finansowy"
                });

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply(
                `❌ Nie udało się wykonać potrącenia.\n\n\`${error.message}\``
            );
        }

        return;
    }

});

// ======================================================
// BŁĘDY
// ======================================================

process.on("unhandledRejection", error => {
    console.error("❌ Unhandled Rejection:", error);
});

process.on("uncaughtException", error => {
    console.error("❌ Uncaught Exception:", error);
});

// ======================================================
// START
// ======================================================

(async () => {

    await registerCommands();

    await client.login(DISCORD_TOKEN);

})();
