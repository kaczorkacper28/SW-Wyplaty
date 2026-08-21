const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");

require("dotenv").config();

// ======================================================
// KONFIGURACJA
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Kanał logów wypłat na serwerze SW
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";

// Webhook na GŁÓWNYM serwerze wypłat
const PAYOUT_WEBHOOK_URL =
    process.env.PAYOUT_WEBHOOK_URL || "";

// Godzina niedzielnej wypłaty
// 12:00 czasu polskiego
const PAYOUT_HOUR = 12;
const PAYOUT_MINUTE = 0;

// ======================================================
// STAWKI
// ======================================================

const PAYMENTS = {
    candidate: 1500,
    nco: 2500,
    warrant: 3200,
    officer: 4000,
    general: 5500,
    command: 6500
};

// ======================================================
// RANGI SW
// ======================================================

// KORPUS SZEREGOWYCH
const CANDIDATE_ROLES = [
    "Kandydat SW",
    "Rekrut SW",
    "Szeregowy SW",
    "st. szeregowy"
];

// KORPUS PODOFICERÓW
const NCO_ROLES = [
    "Kapral",
    "st. Kapral",
    "Plutonowy",
    "st. Plutonowy",
    "Sierżant",
    "st. Sierżant",
    "Sierżant sztabowy"
];

// KORPUS CHORĄŻYCH
const WARRANT_ROLES = [
    "Młodszy chorąży",
    "chorąży",
    "st. chorąży",
    "st. chorąży sztabowy"
];

// KORPUS OFICERÓW
const OFFICER_ROLES = [
    "Podporucznik",
    "Porucznik",
    "Kapitan",
    "Major",
    "Podpułkownik",
    "Pułkownik"
];

// DOWÓDZTWO
const COMMAND_ROLES = [
    "Dowódca zmiany",
    "zca. Dowódca zmiany"
];

// KORPUS GENERAŁÓW
const GENERAL_ROLES = [
    "Generał SW",
    "Generał Inspektor SW"
];

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// ======================================================
// KOMENDY
// ======================================================

const commands = [
    {
        name: "wyplaty",
        description: "Pokazuje aktualną listę tygodniowych wypłat SW"
    },
    {
        name: "wyplata-test",
        description: "Testuje system niedzielnych wypłat SW"
    }
];

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

// ======================================================
// FUNKCJA SPRAWDZAJĄCA RANGĘ
// ======================================================

function findRole(member, roleNames) {

    for (const roleName of roleNames) {

        const role = member.roles.cache.find(
            r =>
                r.name.toLowerCase() ===
                roleName.toLowerCase()
        );

        if (role) {
            return role;
        }
    }

    return null;
}

// ======================================================
// USTALANIE WYPŁATY
// ======================================================

function getPaymentInfo(member) {

    // DOWÓDZTWO
    const commandRole =
        findRole(member, COMMAND_ROLES);

    if (commandRole) {

        return {
            rank: commandRole.name,
            category: "Dowództwo SW",
            amount: PAYMENTS.command
        };
    }

    // GENERAŁOWIE
    const generalRole =
        findRole(member, GENERAL_ROLES);

    if (generalRole) {

        return {
            rank: generalRole.name,
            category: "Korpus Generalski",
            amount: PAYMENTS.general
        };
    }

    // OFICEROWIE
    const officerRole =
        findRole(member, OFFICER_ROLES);

    if (officerRole) {

        return {
            rank: officerRole.name,
            category: "Korpus Oficerski",
            amount: PAYMENTS.officer
        };
    }

    // CHORĄŻOWIE
    const warrantRole =
        findRole(member, WARRANT_ROLES);

    if (warrantRole) {

        return {
            rank: warrantRole.name,
            category: "Korpus Chorążych",
            amount: PAYMENTS.warrant
        };
    }

    // PODOFICEROWIE
    const ncoRole =
        findRole(member, NCO_ROLES);

    if (ncoRole) {

        return {
            rank: ncoRole.name,
            category: "Korpus Podoficerski",
            amount: PAYMENTS.nco
        };
    }

    // SZEREGOWI
    const candidateRole =
        findRole(member, CANDIDATE_ROLES);

    if (candidateRole) {

        return {
            rank: candidateRole.name,
            category: "Korpus Szeregowych",
            amount: PAYMENTS.candidate
        };
    }

    // BRAK RANGI SW
    return null;
}

// ======================================================
// POBIERANIE LISTY WYPŁAT
// ======================================================

async function createPayoutList() {

    const guild =
        await client.guilds.fetch(GUILD_ID);

    await guild.members.fetch();

    const payouts = [];

    for (const member of guild.members.cache.values()) {

        // Pomijamy boty
        if (member.user.bot) continue;

        const payment =
            getPaymentInfo(member);

        if (!payment) continue;

        payouts.push({
            userId: member.id,
            username: member.user.username,
            mention: `<@${member.id}>`,
            rank: payment.rank,
            category: payment.category,
            amount: payment.amount
        });
    }

    return payouts;
}

// ======================================================
// WYSŁANIE LISTY NA GŁÓWNY SERWER
// ======================================================

async function sendPayoutWebhook(payouts) {

    if (!PAYOUT_WEBHOOK_URL) {

        console.log(
            "⚠️ Brak PAYOUT_WEBHOOK_URL."
        );

        return false;
    }

    if (payouts.length === 0) {

        console.log(
            "ℹ️ Nie znaleziono funkcjonariuszy do wypłaty."
        );

        return false;
    }

    const total =
        payouts.reduce(
            (sum, payout) =>
                sum + payout.amount,
            0
        );

    const lines =
        payouts.map(
            (payout, index) =>
                `${index + 1}. ${payout.mention} — ` +
                `**${payout.rank}** — ` +
                `${payout.category} — ` +
                `**${payout.amount.toLocaleString("pl-PL")} PLN**`
        );

    const embed = {

        title:
            "💰 TYGODNIOWE WYPŁATY — SŁUŻBA WIĘZIENNA",

        description:
            `📅 **Niedzielna lista wypłat**\n\n` +
            lines.join("\n") +
            `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 **Liczba funkcjonariuszy:** ${payouts.length}\n` +
            `💵 **Łączna kwota:** ${total.toLocaleString("pl-PL")} PLN`,

        color: 0x19a85b,

        footer: {
            text:
                "Służba Więzienna • Tygodniowe wypłaty"
        },

        timestamp:
            new Date().toISOString()
    };

    try {

        const response =
            await fetch(
                PAYOUT_WEBHOOK_URL,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        username:
                            "System Wypłat SW",

                        embeds: [
                            embed
                        ]
                    })
                }
            );

        if (!response.ok) {

            console.error(
                `❌ Webhook HTTP ${response.status}`
            );

            return false;
        }

        console.log(
            "✅ Lista wypłat wysłana na serwer główny."
        );

        return true;

    } catch (error) {

        console.error(
            "❌ Błąd webhooka:",
            error
        );

        return false;
    }
}

// ======================================================
// LOG NA SERWERZE SW
// ======================================================

async function sendLocalLog(payouts) {

    if (!LOG_CHANNEL_ID) return;

    const channel =
        await client.channels.fetch(
            LOG_CHANNEL_ID
        ).catch(() => null);

    if (!channel) return;

    const total =
        payouts.reduce(
            (sum, payout) =>
                sum + payout.amount,
            0
        );

    const lines =
        payouts.map(
            payout =>
                `${payout.mention} — **${payout.amount.toLocaleString("pl-PL")} PLN**`
        );

    const embed =
        new EmbedBuilder()

            .setColor(0x19a85b)

            .setTitle(
                "📋 WYKONANO LISTĘ TYGODNIOWYCH WYPŁAT"
            )

            .setDescription(
                lines.join("\n") +
                `\n\n💵 **Łącznie:** ${total.toLocaleString("pl-PL")} PLN`
            )

            .setFooter({
                text:
                    "Służba Więzienna • System wypłat"
            })

            .setTimestamp();

    await channel.send({
        embeds: [embed]
    });
}

// ======================================================
// WYKONANIE WYPŁAT
// ======================================================

async function processPayouts() {

    console.log(
        "💰 Rozpoczynam sprawdzanie wypłat..."
    );

    try {

        const payouts =
            await createPayoutList();

        console.log(
            `👥 Znaleziono ${payouts.length} osób.`
        );

        if (payouts.length === 0) {
            return;
        }

        const sent =
            await sendPayoutWebhook(
                payouts
            );

        if (sent) {

            await sendLocalLog(
                payouts
            );
        }

    } catch (error) {

        console.error(
            "❌ Błąd systemu wypłat:",
            error
        );
    }
}

// ======================================================
// AUTOMATYCZNA NIEDZIELA
// ======================================================

function checkSundayPayout() {

    const now = new Date();

    // JS:
    // 0 = niedziela
    // 1 = poniedziałek
    // itd.

    const day =
        now.getDay();

    const hour =
        now.getHours();

    const minute =
        now.getMinutes();

    if (
        day === 0 &&
        hour === PAYOUT_HOUR &&
        minute === PAYOUT_MINUTE
    ) {

        processPayouts();
    }
}

// ======================================================
// READY
// ======================================================

client.once(
    "ready",
    async () => {

        console.log(
            "======================================"
        );

        console.log(
            `✅ Zalogowano jako ${client.user.tag}`
        );

        console.log(
            "🛡️ System Służby Więziennej"
        );

        console.log(
            "💰 Wypłaty: każda niedziela, 12:00"
        );

        console.log(
            "======================================"
        );

        try {

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                "✅ Zarejestrowano komendy."
            );

        } catch (error) {

            console.error(
                "❌ Błąd rejestracji komend:",
                error
            );
        }

        // Sprawdzamy co minutę
        setInterval(
            checkSundayPayout,
            60 * 1000
        );
    }
);

// ======================================================
// INTERAKCJE
// ======================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isChatInputCommand()) {
            return;
        }

        // ==================================================
        // /wyplaty
        // ==================================================

        if (
            interaction.commandName ===
            "wyplaty"
        ) {

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                const payouts =
                    await createPayoutList();

                if (payouts.length === 0) {

                    return interaction.editReply(
                        "ℹ️ Nie znaleziono żadnych funkcjonariuszy z przypisaną wypłatą."
                    );
                }

                const total =
                    payouts.reduce(
                        (sum, payout) =>
                            sum + payout.amount,
                        0
                    );

                const lines =
                    payouts.map(
                        payout =>
                            `${payout.mention} — ` +
                            `${payout.rank} — ` +
                            `**${payout.amount.toLocaleString("pl-PL")} PLN**`
                    );

                const embed =
                    new EmbedBuilder()

                        .setColor(0x19a85b)

                        .setTitle(
                            "💰 AKTUALNA LISTA WYPŁAT SW"
                        )

                        .setDescription(
                            lines.join("\n") +
                            `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
                            `👥 Osób: **${payouts.length}**\n` +
                            `💵 Łącznie: **${total.toLocaleString("pl-PL")} PLN**`
                        )

                        .setFooter({
                            text:
                                "Wypłaty realizowane w każdą niedzielę"
                        });

                return interaction.editReply({
                    embeds: [embed]
                });

            } catch (error) {

                console.error(error);

                return interaction.editReply(
                    "❌ Nie udało się pobrać listy wypłat."
                );
            }
        }

        // ==================================================
        // /wyplata-test
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-test"
        ) {

            if (
                !interaction.memberPermissions.has(
                    PermissionFlagsBits.ManageGuild
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Nie masz uprawnień do testowania wypłat.",
                    ephemeral: true
                });
            }

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                const payouts =
                    await createPayoutList();

                if (payouts.length === 0) {

                    return interaction.editReply(
                        "ℹ️ Nie znaleziono funkcjonariuszy do wypłaty."
                    );
                }

                const total =
                    payouts.reduce(
                        (sum, payout) =>
                            sum + payout.amount,
                        0
                    );

                const sent =
                    await sendPayoutWebhook(
                        payouts
                    );

                if (!sent) {

                    return interaction.editReply(
                        "❌ Test nie został wysłany. Sprawdź PAYOUT_WEBHOOK_URL."
                    );
                }

                return interaction.editReply(
                    `✅ Test wypłat wykonany.\n\n` +
                    `👥 Osób: **${payouts.length}**\n` +
                    `💰 Łącznie: **${total.toLocaleString("pl-PL")} PLN**`
                );

            } catch (error) {

                console.error(error);

                return interaction.editReply(
                    "❌ Wystąpił błąd podczas testu."
                );
            }
        }
    }
);

// ======================================================
// BŁĘDY
// ======================================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Discord Client Error:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Unhandled Rejection:",
            error
        );
    }
);

// ======================================================
// ENV
// ======================================================

if (
    !TOKEN ||
    !CLIENT_ID ||
    !GUILD_ID
) {

    console.error(
        "❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID."
    );

    process.exit(1);
}

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
