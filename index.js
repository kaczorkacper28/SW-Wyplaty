const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    REST,
    Routes,
    PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");

require("dotenv").config();

// ======================================================
// KONFIGURACJA
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// Kanał logów na serwerze SW
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || "";

// Webhook na GŁÓWNYM serwerze wypłat
const PAYOUT_WEBHOOK_URL =
    process.env.PAYOUT_WEBHOOK_URL || "";

// Niedziela, godzina wypłaty
const PAYOUT_HOUR = 12;
const PAYOUT_MINUTE = 0;

// ======================================================
// PLIK DANYCH
// ======================================================

const DATA_FILE = path.join(__dirname, "payout-data.json");

const DEFAULT_DATA = {
    payouts: [],
    webhookMessageId: null,
    lastAutomaticPayout: null
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(
                DATA_FILE,
                JSON.stringify(DEFAULT_DATA, null, 2)
            );

            return {
                ...DEFAULT_DATA
            };
        }

        const data =
            JSON.parse(
                fs.readFileSync(DATA_FILE, "utf8")
            );

        return {
            ...DEFAULT_DATA,
            ...data
        };
    } catch (error) {
        console.error(
            "❌ Nie udało się wczytać payout-data.json:",
            error
        );

        return {
            ...DEFAULT_DATA
        };
    }
}

let data = loadData();

function saveData() {
    try {
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );
    } catch (error) {
        console.error(
            "❌ Nie udało się zapisać payout-data.json:",
            error
        );
    }
}

// ======================================================
// STAWKI DOMYŚLNE
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
        description: "Wysyła aktualną listę wypłat na główny serwer"
    },

    {
        name: "wyplata-edytuj",
        description: "Edytuje wypłatę konkretnego funkcjonariusza",
        options: [
            {
                name: "osoba",
                description: "Funkcjonariusz",
                type: 6,
                required: true
            },
            {
                name: "kwota",
                description: "Nowa kwota wypłaty w PLN",
                type: 4,
                required: true,
                min_value: 0,
                max_value: 1000000
            }
        ]
    },

    {
        name: "wyplata-dodaj",
        description: "Dodaje osobę do aktualnej listy wypłat",
        options: [
            {
                name: "osoba",
                description: "Funkcjonariusz",
                type: 6,
                required: true
            },
            {
                name: "kwota",
                description: "Kwota wypłaty w PLN",
                type: 4,
                required: true,
                min_value: 0,
                max_value: 1000000
            },
            {
                name: "ranga",
                description: "Ranga funkcjonariusza",
                type: 3,
                required: false
            }
        ]
    },

    {
        name: "wyplata-usun",
        description: "Usuwa osobę z aktualnej listy wypłat",
        options: [
            {
                name: "osoba",
                description: "Funkcjonariusz",
                type: 6,
                required: true
            }
        ]
    },

    {
        name: "wyplata-reset",
        description: "Tworzy nową listę na podstawie aktualnych rang SW"
    }
];

// ======================================================
// REST
// ======================================================

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

// ======================================================
// ZNAJDOWANIE RANGI
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
// USTALANIE WYPŁATY Z RANGI
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

    return null;
}

// ======================================================
// POBIERANIE NOWEJ LISTY Z SERWERA SW
// ======================================================

async function createFreshPayoutList() {

    const guild =
        await client.guilds.fetch(GUILD_ID);

    await guild.members.fetch();

    const payouts = [];

    for (const member of guild.members.cache.values()) {

        if (member.user.bot) {
            continue;
        }

        const payment =
            getPaymentInfo(member);

        if (!payment) {
            continue;
        }

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
// RESET LISTY
// ======================================================

async function resetPayoutList() {

    const payouts =
        await createFreshPayoutList();

    data.payouts = payouts;

    saveData();

    return payouts;
}

// ======================================================
// FORMATOWANIE PLN
// ======================================================

function formatMoney(amount) {
    return `${Number(amount).toLocaleString("pl-PL")} PLN`;
}

// ======================================================
// TWORZENIE EMBEDU
// ======================================================

function createPayoutEmbed() {

    const payouts = data.payouts || [];

    const total =
        payouts.reduce(
            (sum, payout) =>
                sum + Number(payout.amount || 0),
            0
        );

    if (payouts.length === 0) {

        return new EmbedBuilder()

            .setColor(0xe53935)

            .setTitle(
                "💰 TYGODNIOWE WYPŁATY — SŁUŻBA WIĘZIENNA"
            )

            .setDescription(
                "❌ Aktualnie lista wypłat jest pusta."
            )

            .setFooter({
                text:
                    "Służba Więzienna • System wypłat"
            })

            .setTimestamp();
    }

    const lines =
        payouts.map(
            (payout, index) =>
                `**${index + 1}.** ${payout.mention}\n` +
                `> 🎖️ ${payout.rank}\n` +
                `> 🏛️ ${payout.category}\n` +
                `> 💰 **${formatMoney(payout.amount)}**`
        );

    return new EmbedBuilder()

        .setColor(0x19a85b)

        .setTitle(
            "💰 TYGODNIOWE WYPŁATY — SŁUŻBA WIĘZIENNA"
        )

        .setDescription(
            lines.join("\n\n") +
            `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
            `👥 **Liczba funkcjonariuszy:** ${payouts.length}\n` +
            `💵 **Łączna kwota:** ${formatMoney(total)}\n` +
            `📅 **Wypłata:** każda niedziela, 12:00`
        )

        .setFooter({
            text:
                "Służba Więzienna • System tygodniowych wypłat"
        })

        .setTimestamp();
}

// ======================================================
// WEBHOOK — EDYCJA / WYSŁANIE WIADOMOŚCI
// ======================================================

function getWebhookUrlWithWait() {

    if (!PAYOUT_WEBHOOK_URL) {
        return null;
    }

    return PAYOUT_WEBHOOK_URL.includes("?")
        ? `${PAYOUT_WEBHOOK_URL}&wait=true`
        : `${PAYOUT_WEBHOOK_URL}?wait=true`;
}

// ======================================================
// WYSŁANIE LUB EDYCJA LISTY NA GŁÓWNYM SERWERZE
// ======================================================

async function sendOrUpdateWebhook() {

    if (!PAYOUT_WEBHOOK_URL) {

        console.log(
            "⚠️ Brak PAYOUT_WEBHOOK_URL."
        );

        return false;
    }

    const payload = {
        username: "System Wypłat SW",
        embeds: [
            createPayoutEmbed().toJSON()
        ]
    };

    try {

        // JEŻELI MAMY JUŻ WIADOMOŚĆ — EDYTUJEMY JĄ
        if (data.webhookMessageId) {

            const editUrl =
                `${PAYOUT_WEBHOOK_URL}/messages/${data.webhookMessageId}`;

            const response =
                await fetch(
                    editUrl,
                    {
                        method: "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            embeds: payload.embeds
                        })
                    }
                );

            if (response.ok) {

                console.log(
                    "✅ Zaktualizowano istniejącą listę wypłat."
                );

                return true;
            }

            // Jeżeli wiadomość już nie istnieje,
            // stworzymy nową.
            if (response.status !== 404) {

                console.error(
                    `❌ Błąd edycji webhooka: HTTP ${response.status}`
                );

                return false;
            }

            data.webhookMessageId = null;
            saveData();
        }

        // TWORZENIE NOWEJ WIADOMOŚCI
        const response =
            await fetch(
                getWebhookUrlWithWait(),
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify(payload)
                }
            );

        if (!response.ok) {

            console.error(
                `❌ Webhook HTTP ${response.status}`
            );

            const text =
                await response.text();

            console.error(text);

            return false;
        }

        const message =
            await response.json();

        data.webhookMessageId =
            message.id;

        saveData();

        console.log(
            "✅ Utworzono nową listę wypłat na głównym serwerze."
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
// LOGI NA SERWERZE SW
// ======================================================

async function sendLocalLog(title, description, color = 0x19a85b) {

    if (!LOG_CHANNEL_ID) {
        return;
    }

    const channel =
        await client.channels.fetch(
            LOG_CHANNEL_ID
        ).catch(() => null);

    if (!channel) {
        return;
    }

    const embed =
        new EmbedBuilder()

            .setColor(color)

            .setTitle(title)

            .setDescription(description)

            .setFooter({
                text:
                    "Służba Więzienna • System wypłat"
            })

            .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(error => {
        console.error(
            "❌ Nie udało się wysłać logu:",
            error
        );
    });
}

// ======================================================
// SPRAWDZANIE UPRAWNIEŃ
// ======================================================

function hasManagePermission(interaction) {

    return interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild
    );
}

// ======================================================
// AUTOMATYCZNA WYPŁATA
// ======================================================

async function processAutomaticPayout() {

    console.log(
        "💰 Rozpoczynam automatyczną wypłatę..."
    );

    try {

        if (!data.payouts || data.payouts.length === 0) {

            console.log(
                "ℹ️ Lista wypłat jest pusta."
            );

            return;
        }

        const success =
            await sendOrUpdateWebhook();

        if (!success) {
            return;
        }

        const now =
            getPolandDate();

        const payoutKey =
            `${now.year}-${now.month}-${now.day}`;

        data.lastAutomaticPayout =
            payoutKey;

        saveData();

        const total =
            data.payouts.reduce(
                (sum, payout) =>
                    sum + Number(payout.amount || 0),
                0
            );

        await sendLocalLog(
            "💰 WYKONANO TYGODNIOWĄ WYPŁATĘ",
            `✅ Lista wypłat została wysłana/zaktualizowana.\n\n` +
            `👥 Osób: **${data.payouts.length}**\n` +
            `💵 Łącznie: **${formatMoney(total)}**`
        );

        console.log(
            "✅ Automatyczna wypłata wykonana."
        );

    } catch (error) {

        console.error(
            "❌ Błąd automatycznej wypłaty:",
            error
        );
    }
}

// ======================================================
// CZAS POLSKI
// ======================================================

function getPolandDate() {

    const parts =
        new Intl.DateTimeFormat(
            "en-GB",
            {
                timeZone: "Europe/Warsaw",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                weekday: "short",
                hourCycle: "h23"
            }
        ).formatToParts(new Date());

    const result = {};

    for (const part of parts) {
        result[part.type] = part.value;
    }

    return {
        year: Number(result.year),
        month: Number(result.month),
        day: Number(result.day),
        hour: Number(result.hour),
        minute: Number(result.minute),
        weekday: result.weekday
    };
}

// ======================================================
// SPRAWDZANIE NIEDZIELNEJ WYPŁATY
// ======================================================

function checkSundayPayout() {

    const now =
        getPolandDate();

    // Sun = niedziela
    if (now.weekday !== "Sun") {
        return;
    }

    if (
        now.hour !== PAYOUT_HOUR ||
        now.minute !== PAYOUT_MINUTE
    ) {
        return;
    }

    const payoutKey =
        `${now.year}-${now.month}-${now.day}`;

    // Zabezpieczenie przed podwójną wypłatą
    if (
        data.lastAutomaticPayout ===
        payoutKey
    ) {
        return;
    }

    processAutomaticPayout();
}

// ======================================================
// READY
// ======================================================

client.once(
    "ready",
    async () => {

        console.log(
            "=========================================="
        );

        console.log(
            `✅ Zalogowano jako ${client.user.tag}`
        );

        console.log(
            "🛡️ System Wypłat Służby Więziennej"
        );

        console.log(
            "💰 Automatyczne wypłaty: niedziela 12:00"
        );

        console.log(
            "=========================================="
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
                "✅ Zarejestrowano wszystkie komendy."
            );

        } catch (error) {

            console.error(
                "❌ Błąd rejestracji komend:",
                error
            );
        }

        // Sprawdzamy czas co minutę
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

            return interaction.reply({
                embeds: [
                    createPayoutEmbed()
                ]
            });
        }

        // ==================================================
        // KOMENDY ADMINISTRACYJNE
        // ==================================================

        const adminCommands = [
            "wyplata-test",
            "wyplata-edytuj",
            "wyplata-dodaj",
            "wyplata-usun",
            "wyplata-reset"
        ];

        if (
            adminCommands.includes(
                interaction.commandName
            )
        ) {

            if (!hasManagePermission(interaction)) {

                return interaction.reply({
                    content:
                        "❌ Nie masz uprawnień do zarządzania wypłatami.",
                    ephemeral: true
                });
            }
        }

        // ==================================================
        // /wyplata-test
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-test"
        ) {

            await interaction.deferReply({
                ephemeral: true
            });

            const success =
                await sendOrUpdateWebhook();

            if (!success) {

                return interaction.editReply(
                    "❌ Nie udało się wysłać listy. Sprawdź `PAYOUT_WEBHOOK_URL`."
                );
            }

            await sendLocalLog(
                "🧪 TEST WYPŁAT",
                `Administrator <@${interaction.user.id}> wykonał test listy wypłat.`
            );

            return interaction.editReply(
                "✅ Aktualna lista wypłat została wysłana/zaktualizowana na głównym serwerze."
            );
        }

        // ==================================================
        // /wyplata-edytuj
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-edytuj"
        ) {

            const user =
                interaction.options.getUser(
                    "osoba"
                );

            const amount =
                interaction.options.getInteger(
                    "kwota"
                );

            const payout =
                data.payouts.find(
                    p => p.userId === user.id
                );

            if (!payout) {

                return interaction.reply({
                    content:
                        `❌ ${user} nie znajduje się na aktualnej liście wypłat.\n\n` +
                        `Użyj najpierw \`/wyplata-dodaj\` albo \`/wyplata-reset\`.`,
                    ephemeral: true
                });
            }

            const oldAmount =
                payout.amount;

            payout.amount =
                amount;

            saveData();

            await sendOrUpdateWebhook();

            await sendLocalLog(
                "✏️ EDYCJA WYPŁATY",
                `<@${interaction.user.id}> zmienił wypłatę ${user}.\n\n` +
                `💰 Było: **${formatMoney(oldAmount)}**\n` +
                `💰 Jest: **${formatMoney(amount)}**`
            );

            return interaction.reply({
                content:
                    `✅ Zmieniono wypłatę dla ${user}.\n\n` +
                    `💰 Poprzednio: **${formatMoney(oldAmount)}**\n` +
                    `💰 Aktualnie: **${formatMoney(amount)}**\n\n` +
                    `📋 Lista na głównym serwerze została zaktualizowana.`,
                ephemeral: true
            });
        }

        // ==================================================
        // /wyplata-dodaj
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-dodaj"
        ) {

            const user =
                interaction.options.getUser(
                    "osoba"
                );

            const amount =
                interaction.options.getInteger(
                    "kwota"
                );

            const rank =
                interaction.options.getString(
                    "ranga"
                ) || "Funkcjonariusz SW";

            const existing =
                data.payouts.find(
                    p => p.userId === user.id
                );

            if (existing) {

                return interaction.reply({
                    content:
                        `❌ ${user} już znajduje się na liście.\n` +
                        `Użyj \`/wyplata-edytuj\`, aby zmienić kwotę.`,
                    ephemeral: true
                });
            }

            data.payouts.push({
                userId: user.id,
                username: user.username,
                mention: `<@${user.id}>`,
                rank: rank,
                category: "Ręcznie dodany",
                amount: amount
            });

            saveData();

            await sendOrUpdateWebhook();

            await sendLocalLog(
                "➕ DODANO OSOBĘ DO WYPŁAT",
                `<@${interaction.user.id}> dodał ${user} do listy.\n\n` +
                `🎖️ Ranga: **${rank}**\n` +
                `💰 Wypłata: **${formatMoney(amount)}**`
            );

            return interaction.reply({
                content:
                    `✅ Dodano ${user} do aktualnej listy.\n\n` +
                    `🎖️ Ranga: **${rank}**\n` +
                    `💰 Wypłata: **${formatMoney(amount)}**`,
                ephemeral: true
            });
        }

        // ==================================================
        // /wyplata-usun
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-usun"
        ) {

            const user =
                interaction.options.getUser(
                    "osoba"
                );

            const index =
                data.payouts.findIndex(
                    p => p.userId === user.id
                );

            if (index === -1) {

                return interaction.reply({
                    content:
                        `❌ ${user} nie znajduje się na aktualnej liście.`,
                    ephemeral: true
                });
            }

            const removed =
                data.payouts[index];

            data.payouts.splice(
                index,
                1
            );

            saveData();

            await sendOrUpdateWebhook();

            await sendLocalLog(
                "➖ USUNIĘTO OSOBĘ Z WYPŁAT",
                `<@${interaction.user.id}> usunął ${user} z listy.\n\n` +
                `💰 Usunięta kwota: **${formatMoney(removed.amount)}**`
            );

            return interaction.reply({
                content:
                    `✅ Usunięto ${user} z aktualnej listy wypłat.`,
                ephemeral: true
            });
        }

        // ==================================================
        // /wyplata-reset
        // ==================================================

        if (
            interaction.commandName ===
            "wyplata-reset"
        ) {

            await interaction.deferReply({
                ephemeral: true
            });

            try {

                const oldCount =
                    data.payouts.length;

                const payouts =
                    await resetPayoutList();

                await sendOrUpdateWebhook();

                const total =
                    payouts.reduce(
                        (sum, payout) =>
                            sum + Number(payout.amount || 0),
                        0
                    );

                await sendLocalLog(
                    "🔄 ZRESETOWANO LISTĘ WYPŁAT",
                    `<@${interaction.user.id}> utworzył nową listę na podstawie aktualnych rang SW.\n\n` +
                    `👥 Było: **${oldCount}**\n` +
                    `👥 Teraz: **${payouts.length}**\n` +
                    `💵 Łącznie: **${formatMoney(total)}**`
                );

                return interaction.editReply(
                    `✅ Utworzono nową listę wypłat na podstawie rang SW.\n\n` +
                    `👥 Funkcjonariuszy: **${payouts.length}**\n` +
                    `💰 Łącznie: **${formatMoney(total)}**`
                );

            } catch (error) {

                console.error(error);

                return interaction.editReply(
                    "❌ Nie udało się utworzyć nowej listy."
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
// SPRAWDZENIE ENV
// ======================================================

if (
    !TOKEN ||
    !CLIENT_ID ||
    !GUILD_ID
) {

    console.error(
        "❌ Brakuje TOKEN, CLIENT_ID lub GUILD_ID w Variables/Environment."
    );

    process.exit(1);
}

// ======================================================
// LOGIN
// ======================================================

client.login(TOKEN);
