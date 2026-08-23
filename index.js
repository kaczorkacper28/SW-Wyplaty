require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

// ======================================================
// KONFIGURACJA
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const SW_GUILD_ID = process.env.SW_GUILD_ID;
const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID;

const UNB_API_TOKEN = process.env.UNB_API_TOKEN;

const PAYOUT_ROLE_ID = process.env.PAYOUT_ROLE_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// ======================================================
// SPRAWDZANIE ENV
// ======================================================

const required = [
    ["TOKEN", TOKEN],
    ["CLIENT_ID", CLIENT_ID],
    ["SW_GUILD_ID", SW_GUILD_ID],
    ["MAIN_GUILD_ID", MAIN_GUILD_ID],
    ["UNB_API_TOKEN", UNB_API_TOKEN],
    ["PAYOUT_ROLE_ID", PAYOUT_ROLE_ID]
];

const missing = required
    .filter(([name, value]) => !value)
    .map(([name]) => name);

if (missing.length > 0) {
    console.error(
        "❌ Brakuje zmiennych środowiskowych:",
        missing.join(", ")
    );
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
 * Wykonuje zapytanie do UnbelievaBoat API.
 */
async function unbRequest(endpoint, options = {}) {

    const response = await fetch(
        `${UNB_BASE_URL}${endpoint}`,
        {
            ...options,
            headers: {
                "Authorization": UNB_API_TOKEN,
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        }
    );

    const text = await response.text();

    let data;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!response.ok) {
        const error = new Error(
            `UnbelievaBoat API ${response.status}`
        );

        error.status = response.status;
        error.data = data;

        throw error;
    }

    return data;
}

// ======================================================
// SPRAWDZENIE SALDA
// ======================================================

async function getBalance(userId) {

    return await unbRequest(
        `/guilds/${MAIN_GUILD_ID}/users/${userId}`
    );
}

// ======================================================
// DODANIE WYPŁATY
// ======================================================

async function addPayout(userId, amount, reason) {

    return await unbRequest(
        `/guilds/${MAIN_GUILD_ID}/users/${userId}`,
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
// FORMATOWANIE PIENIĘDZY
// ======================================================

function money(amount) {
    return Number(amount || 0).toLocaleString("pl-PL");
}

// ======================================================
// KOMENDY
// ======================================================

const commands = [

    new SlashCommandBuilder()
        .setName("sw-wyplata")
        .setDescription("Wypłać pieniądze funkcjonariuszowi na głównym serwerze.")
        .addUserOption(option =>
            option
                .setName("osoba")
                .setDescription("Osoba otrzymująca wypłatę.")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("kwota")
                .setDescription("Kwota wypłaty.")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000000000)
        )
        .addStringOption(option =>
            option
                .setName("powod")
                .setDescription("Powód wypłaty.")
                .setRequired(false)
                .setMaxLength(500)
        )

].map(command => command.toJSON());

// ======================================================
// REJESTRACJA KOMEND
// ======================================================

async function registerCommands() {

    const rest = new REST({
        version: "10"
    }).setToken(TOKEN);

    console.log("🔄 Rejestrowanie komendy SW...");

    await rest.put(
        Routes.applicationGuildCommands(
            CLIENT_ID,
            SW_GUILD_ID
        ),
        {
            body: commands
        }
    );

    console.log("✅ Komenda /sw-wyplata została zarejestrowana.");
}

// ======================================================
// BOT READY
// ======================================================

client.once("ready", async () => {

    console.log("=================================");
    console.log(`🤖 Zalogowano jako ${client.user.tag}`);
    console.log(`👮 Serwer SW: ${SW_GUILD_ID}`);
    console.log(`🏛️ Serwer główny: ${MAIN_GUILD_ID}`);
    console.log("💰 System wypłat: AKTYWNY");
    console.log("=================================");

    try {

        await registerCommands();

    } catch (error) {

        console.error(
            "❌ Nie udało się zarejestrować komend:",
            error
        );

    }

});

// ======================================================
// INTERAKCJE
// ======================================================

client.on("interactionCreate", async interaction => {

    // ==================================================
    // IGNORUJ BOTY
    // ==================================================

    if (interaction.user.bot) {
        return;
    }

    // ==================================================
    // TYLKO SLASH COMMAND
    // ==================================================

    if (!interaction.isChatInputCommand()) {
        return;
    }

    // ==================================================
    // TYLKO SERWER SW
    // ==================================================

    if (interaction.guildId !== SW_GUILD_ID) {

        return interaction.reply({
            content:
                "❌ Ta komenda może być używana wyłącznie na serwerze Służby Więziennej.",
            ephemeral: true
        });

    }

    // ==================================================
    // /SW-WYPLATA
    // ==================================================

    if (interaction.commandName === "sw-wyplata") {

        // ----------------------------------------------
        // SPRAWDZENIE ROLI
        // ----------------------------------------------

        const member = interaction.member;

        const hasPayoutRole =
            member.roles.cache.has(PAYOUT_ROLE_ID);

        const isAdministrator =
            member.permissions.has(
                PermissionFlagsBits.Administrator
            );

        if (!hasPayoutRole && !isAdministrator) {

            return interaction.reply({
                content:
                    "❌ Nie masz uprawnień do wykonywania wypłat.",
                ephemeral: true
            });

        }

        // ----------------------------------------------
        // POBRANIE DANYCH
        // ----------------------------------------------

        const target =
            interaction.options.getUser("osoba");

        const amount =
            interaction.options.getInteger("kwota");

        const reason =
            interaction.options.getString("powod") ||
            "Wypłata służbowa SW";

        // ----------------------------------------------
        // NIE POZWALAMY WYPŁACAĆ BOTOM
        // ----------------------------------------------

        if (target.bot) {

            return interaction.reply({
                content:
                    "❌ Nie można wypłacać pieniędzy kontom botów.",
                ephemeral: true
            });

        }

        // ----------------------------------------------
        // ZABEZPIECZENIE KWOTY
        // ----------------------------------------------

        if (!Number.isInteger(amount) || amount <= 0) {

            return interaction.reply({
                content:
                    "❌ Podaj prawidłową kwotę większą od 0.",
                ephemeral: true
            });

        }

        // ----------------------------------------------
        // DEFER
        // ----------------------------------------------

        await interaction.deferReply();

        try {

            // ------------------------------------------
            // SPRAWDZENIE SALDA PRZED
            // ------------------------------------------

            let before;

            try {

                before = await getBalance(target.id);

            } catch (error) {

                console.error(
                    "❌ Błąd pobierania salda:",
                    error
                );

                return interaction.editReply({
                    content:
                        "❌ Nie udało się pobrać konta użytkownika z UnbelievaBoat.\n\n" +
                        "Sprawdź, czy użytkownik znajduje się na głównym serwerze."
                });

            }

            // ------------------------------------------
            // WYKONANIE WYPŁATY
            // ------------------------------------------

            const result =
                await addPayout(
                    target.id,
                    amount,
                    `${reason} | Wypłacający: ${interaction.user.tag}`
                );

            // ------------------------------------------
            // SALDO PO
            // ------------------------------------------

            let after = result;

            if (!after || typeof after.total === "undefined") {

                try {

                    after = await getBalance(target.id);

                } catch {

                    after = null;

                }

            }

            // ------------------------------------------
            // EMBED
            // ------------------------------------------

            const embed =
                new EmbedBuilder()
                    .setTitle("💰 Wypłata służbowa SW")
                    .setDescription(
                        `Wypłata została pomyślnie wykonana na **głównym serwerze**.`
                    )
                    .addFields(
                        {
                            name: "👤 Funkcjonariusz",
                            value:
                                `${target} \n\`${target.id}\``,
                            inline: true
                        },
                        {
                            name: "💵 Kwota",
                            value:
                                `**${money(amount)}**`,
                            inline: true
                        },
                        {
                            name: "👮 Wypłacający",
                            value:
                                `${interaction.user}`,
                            inline: true
                        },
                        {
                            name: "📋 Powód",
                            value:
                                reason,
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text:
                            "Służba Więzienna • System wypłat"
                    });

            // ------------------------------------------
            // INFORMACJA O SALDZIE
            // ------------------------------------------

            if (before) {

                embed.addFields({
                    name: "💳 Saldo przed",
                    value:
                        `${money(before.total)}`
                });

            }

            if (after && typeof after.total !== "undefined") {

                embed.addFields({
                    name: "💳 Saldo po",
                    value:
                        `${money(after.total)}`
                });

            }

            await interaction.editReply({
                embeds: [embed]
            });

            // ------------------------------------------
            // LOGI
            // ------------------------------------------

            if (LOG_CHANNEL_ID) {

                const logChannel =
                    await client.channels
                        .fetch(LOG_CHANNEL_ID)
                        .catch(() => null);

                if (logChannel && logChannel.isTextBased()) {

                    const logEmbed =
                        new EmbedBuilder()
                            .setTitle("💰 LOG • Wypłata SW")
                            .addFields(
                                {
                                    name: "👤 Otrzymał",
                                    value:
                                        `${target} (${target.id})`,
                                    inline: false
                                },
                                {
                                    name: "💵 Kwota",
                                    value:
                                        `${money(amount)}`,
                                    inline: true
                                },
                                {
                                    name: "👮 Wypłacający",
                                    value:
                                        `${interaction.user} (${interaction.user.id})`,
                                    inline: true
                                },
                                {
                                    name: "📋 Powód",
                                    value:
                                        reason,
                                    inline: false
                                },
                                {
                                    name: "🏛️ Ekonomia",
                                    value:
                                        "Główny serwer",
                                    inline: true
                                }
                            )
                            .setTimestamp()
                            .setFooter({
                                text:
                                    "Służba Więzienna • Logi wypłat"
                            });

                    await logChannel.send({
                        embeds: [logEmbed]
                    });

                }

            }

        } catch (error) {

            console.error(
                "❌ Błąd UnbelievaBoat:",
                error
            );

            let message =
                "❌ Wystąpił błąd podczas wykonywania wypłaty.";

            if (error.status === 401) {

                message =
                    "❌ Token UnbelievaBoat jest nieprawidłowy lub wygasł.";

            } else if (error.status === 403) {

                message =
                    "❌ UnbelievaBoat odrzucił żądanie. Sprawdź uprawnienia API.";

            } else if (error.status === 404) {

                message =
                    "❌ Nie znaleziono serwera lub konta użytkownika w UnbelievaBoat.";

            } else if (error.status === 429) {

                message =
                    "⏳ UnbelievaBoat ograniczył liczbę żądań. Spróbuj ponownie za chwilę.";

            }

            if (interaction.deferred) {

                await interaction.editReply({
                    content: message
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content: message,
                    ephemeral: true
                }).catch(() => {});

            }

        }

    }

});

// ======================================================
// BŁĘDY
// ======================================================

client.on("error", error => {

    console.error(
        "❌ Discord Client Error:",
        error
    );

});

process.on("unhandledRejection", error => {

    console.error(
        "❌ Unhandled Promise Rejection:",
        error
    );

});

process.on("uncaughtException", error => {

    console.error(
        "❌ Uncaught Exception:",
        error
    );

});

// ======================================================
// START
// ======================================================

client.login(TOKEN);
