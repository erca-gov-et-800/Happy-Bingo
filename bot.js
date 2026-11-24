const { Telegraf, Markup, session } = require('telegraf');
const { admin, db } = require('./firebase');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN environment variable is required');

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://happy-bingo-app.onrender.com';
const CHANNEL_ID = process.env.BOT_CHANNEL_ID || '-1004489083522';
const CHANNEL_URL = process.env.BOT_CHANNEL_URL || 'https://t.me/HappyBingo1256';
const ADMIN_IDS = new Set([
    ...(process.env.ADMIN_ID || '7171741383').split(','),
    ...(process.env.ADMIN_IDS || '').split(',')
].map(v => v.trim()).filter(Boolean));

const REGISTRATION_BONUS = Number(process.env.REGISTRATION_BONUS_ETB || 10);
const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS_ETB || 20);

const DEPOSIT_MINIMUM = Math.max(100, Number(process.env.DEPOSIT_MINIMUM_ETB || 100));
const WITHDRAW_MINIMUM = Math.max(1, Number(process.env.WITHDRAW_MINIMUM_ETB || 100));
const DEPOSIT_INSTRUCTIONS = process.env.DEPOSIT_INSTRUCTIONS ||
    'ðŸ’° áˆ‚áˆ³á‰¥ áˆˆáˆ˜áˆ™áˆ‹á‰µ Telebirr á‹­áˆáˆ¨áŒ¡á¢\n\náŠ áŠáˆµá‰°áŠ› áˆ˜áŒ áŠ•: 100 ETB\nðŸ‘¤ áˆµáˆ: aeal\nðŸ“± áŠ áŠ«á‹áŠ•á‰µ: 0945342345\n\ná‰¥áˆ©áŠ• áŠ¨áˆ‹áŠ© á‰ áŠ‹áˆ‹ á‹¨áŠ­áá‹« áˆ›áˆ¨áŒ‹áŒˆáŒ« SMS á‹ˆá‹­áˆ á‹¨á‹°áˆ¨áˆ°áŠ áŽá‰¶ (Screenshot) á‹­áˆ‹áŠ©á¢ áŠ á‹µáˆšáŠ‘ áŠ«áˆ¨áŒ‹áŒˆáŒ á‹ á‰ áŠ‹áˆ‹ Bonus Balance á‹­áŒ¨áˆ˜áˆ«áˆá¢';
const ADMIN_ID = (process.env.ADMIN_ID || '7171741383').split(',')[0].trim();
const ADMIN_ID_LIST = [...new Set([...ADMIN_IDS])];

const SUPPORT_CONTACT = process.env.SUPPORT_CONTACT || '@happysupporter_bot';

if (!CHANNEL_ID || !CHANNEL_URL) {
    console.warn('BOT_CHANNEL_ID and BOT_CHANNEL_URL must be set to enforce mandatory channel joining.');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

bot.use(async (ctx, next) => {
    if (!ctx.from?.id) return next();
    if (ADMIN_IDS.has(String(ctx.from.id))) return next();
    try {
        const snap = await db.collection('users').doc(String(ctx.from.id)).get();
        if (snap.exists && snap.data().blocked) return ctx.reply('â›” á‹¨áˆ˜áˆˆá‹«á‹Ž áˆ˜á‹³áˆ¨áˆ» á‰ áŠ á‹µáˆšáŠ• á‰³áŒá‹·áˆá¢');
    } catch (e) {
        console.error('Block status check failed:', e.message);
    }
    return next();
});

function isAdmin(ctx) {
    return ADMIN_IDS.has(String(ctx.from?.id));
}

function money(v) {
    return `${Number(v || 0).toFixed(2)} ETB`;
}

async function isChannelMember(ctx) {
    if (!CHANNEL_ID || !ctx.from?.id) return false;

    try {
        const m = await ctx.telegram.getChatMember(CHANNEL_ID, ctx.from.id);
        return (
            ['creator', 'administrator', 'member'].includes(m.status) ||
            (m.status === 'restricted' && m.is_member === true)
        );
    } catch (e) {
        console.error('Channel membership check failed:', e.message);
        return false;
    }
}

async function askToJoin(ctx) {
    return ctx.reply(
        'ðŸ‘‹ á‹ˆá‹° MELBET BINGO áŠ¥áŠ•áŠ³áŠ• á‰ á‹°áˆ…áŠ“ áˆ˜áŒ¡!\n\ná‰€áŒ¥áˆˆá‹ áˆˆáˆ˜áˆ„á‹µ áˆ˜áŒ€áˆ˜áˆªá‹« á‹¨Telegram á‰»áŠ“áˆ‹á‰½áŠ•áŠ• á‹­á‰€áˆ‹á‰€áˆ‰á¢ áŠ¨áŒˆá‰¡ á‰ áŠ‹áˆ‹ â€œâœ… MELBET á‰»áŠ“áˆ‰áŠ• á‰°á‰€áˆ‹á‰…á‹«áˆˆáˆâ€ á‹­áŒ«áŠ‘á¢',
        Markup.inlineKeyboard([
            [Markup.button.url('ðŸ“¢ á‰»áŠ“áˆ‰áŠ• á‰°á‰€áˆ‹á‰€áˆ', CHANNEL_URL)],
            [Markup.button.callback('âœ… MELBET á‰»áŠ“áˆ‰áŠ• á‰°á‰€áˆ‹á‰…á‹«áˆˆáˆ', 'verify_channel')]
        ])
    );
}

function askForContact(ctx) {
    return ctx.reply(
        'âœ… MELBET á‰»áŠ“áˆ‰áŠ• á‰ á‰µáŠ­áŠ­áˆ á‰°á‰€áˆ‹á‰…áˆˆá‹‹áˆá¢\n\náˆá‹áŒˆá‰£á‹áŠ• áˆˆáˆ›áŒ áŠ“á‰€á‰… á‹¨áˆ«áˆµá‹ŽáŠ• áˆµáˆáŠ­ á‰áŒ¥áˆ­ á‹«áŒ‹áˆ©á¢',
        Markup.keyboard([
            [Markup.button.contactRequest('ðŸ“± áˆµáˆáŠ­ á‰áŒ¥áˆ®áŠ• áŠ áŒ‹áˆ«')]
        ]).resize().oneTime()
    );
}

async function showMainMenu(ctx) {
    const replyMarkup = {
        inline_keyboard: [
            [
                { text: "ðŸŽ® Play Melbet Bingo", web_app: { url: WEBAPP_URL }, style: "primary" }
            ],
            [
                { text: "ðŸ’µ Balance", callback_data: "account", style: "success" },
                { text: "ðŸ”— Invite", callback_data: "refer", style: "danger" }
            ],
            [
                { text: "ðŸŽ® Game Rules", callback_data: "rules", style: "primary" },
                { text: "ðŸ†˜ Support", callback_data: "support", style: "primary" }
            ]
        ]
    };

    if (isAdmin(ctx)) {
        replyMarkup.inline_keyboard.push([
            { text: "ðŸ›  Admin Panel", web_app: { url: `${WEBAPP_URL}/admin` }, style: "primary" }
        ]);
    }

    await ctx.reply(
        'âœ… áˆá‹áŒˆá‰£á‹Ž á‰°áˆ³áŠ­á‰·áˆ! áŠ¥á‰£áŠ­á‹Ž áŠ¨á‰³á‰½ áŠ«áˆ‰á‰µ áŠ áˆ›áˆ«áŒ®á‰½ á‹­áˆáˆ¨áŒ¡á¢',
        { reply_markup: replyMarkup }
    );
}

bot.on('callback_query', async (ctx) => {
    const action = ctx.callbackQuery?.data;
    const chatId = ctx.callbackQuery?.message?.chat?.id;
    const userId = String(ctx.from?.id || '');

    if (!action || !chatId || !userId) return;

    if (
        action === 'verify_channel' ||
        action.startsWith('dp_') ||
        action.startsWith('wd_')
    ) {
        return;
    }

    await ctx.answerCbQuery().catch(() => {});

    if (action === 'account') {
        const snap = await db.collection('users').doc(userId).get();

        if (!snap.exists) {
            return ctx.telegram.sendMessage(
                chatId,
                'áˆ˜áŒ€áˆ˜áˆªá‹« /start á‰ áˆ˜áˆ‹áŠ­ á‹­áˆ˜á‹áŒˆá‰¡á¢'
            );
        }

        const d = snap.data();

        return ctx.telegram.sendMessage(
            chatId,
            `ðŸ‘¤ á‹¨áŠ¥áˆ­áˆµá‹Ž áˆ‚áˆ³á‰¥\n` +
            `ðŸ’µ Main Balance: ${money(d.balance)}\n` +
            `ðŸŽ Bonus Balance: ${money(d.bonus)}\n` +
            `ðŸ’³ Deposit áŠ á‹µáˆ­áŒˆá‹‹áˆ: ${d.has_deposited ? 'áŠ á‹Ž' : 'áŒˆáŠ“ áŠ á‹­á‹°áˆˆáˆ'}`
        );
    }

    if (action === 'refer') {
        const me = await ctx.telegram.getMe();
        const link = `https://t.me/${me.username}?start=ref_${userId}`;

        return ctx.telegram.sendMessage(
            chatId,
            `ðŸŽ áŒ“á‹°áŠ›á‹ŽáŠ• á‹­áŒ‹á‰¥á‹™á¢ á‰ áˆŠáŠ•áŠ­á‹Ž á‰°áˆ˜á‹áŒá‰¦ áˆµáˆáŠ©áŠ• áˆ²á‹«áˆ¨áŒ‹áŒáŒ¥ 20 ETB Bonus á‹«áŒˆáŠ›áˆ‰á¢\n\n${link}`,
            Markup.inlineKeyboard([
                [Markup.button.url(
                    'ðŸ“¨ áˆŠáŠ•áŠ©áŠ• áŠ áŒ‹áˆ«',
                    `https://t.me/share/url?url=${encodeURIComponent(link)}`
                )]
            ])
        );
    }

    if (action === 'rules') {
        return ctx.telegram.sendMessage(
            chatId,
            'ðŸŽ® á‹¨Bingo áˆ…áŒŽá‰½\n' +
            'â€¢ áŠ áŠ•á‹µ áŠ«áˆ­á‹µ 10 ETB áŠá‹á¢\n' +
            'â€¢ Bonus Balance á‰€á‹µáˆž á‹­á‰€áŠáˆ³áˆá¤ á‰€áˆªá‹ áŠ¨Main Balance á‹­á‰€áŠáˆ³áˆá¢\n' +
            'â€¢ á‹¨áŒ¨á‹‹á‰³ áˆ½áˆáˆ›á‰µ á‹ˆá‹° Main Balance á‹­áŒˆá‰£áˆá¢\n' +
            'â€¢ áŒˆáŠ•á‹˜á‰¥ áˆˆáˆ›á‹áŒ£á‰µ á‰¢á‹«áŠ•áˆµ áŠ áŠ•á‹µ áŒŠá‹œ Deposit áˆ›á‹µáˆ¨áŒ á‹«áˆµáˆáˆáŒ‹áˆá¢'
        );
    }

    if (action === 'support') {
        return ctx.telegram.sendMessage(
            chatId,
            `ðŸŽ§ áŠ¥áˆ­á‹³á‰³ áˆˆáˆ›áŒáŠ˜á‰µ ${SUPPORT_CONTACT} á‹«áŠáŒ‹áŒáˆ©á¢`
        );
    }
});

async function completeRegistration(ctx, phoneNumber) {
    const uid = String(ctx.from.id);

    const userRef = db.collection('users').doc(uid);
    const pendingRef = db.collection('pending_registrations').doc(uid);

    await db.runTransaction(async tx => {
        const userSnap = await tx.get(userRef);
        const pendingSnap = await tx.get(pendingRef);

        if (userSnap.exists) {
            tx.set(userRef, {
                phone_number: phoneNumber,
                channel_joined: true
            }, { merge: true });
            tx.delete(pendingRef);
            return;
        }

        const pending = pendingSnap.exists ? pendingSnap.data() : {};

        const referrerId =
            pending.referrer_id && String(pending.referrer_id) !== uid
                ? String(pending.referrer_id)
                : null;

        const referrerRef = referrerId
            ? db.collection('users').doc(referrerId)
            : null;

        const referrerSnap = referrerRef
            ? await tx.get(referrerRef)
            : null;

        const now = new Date().toISOString();

        tx.set(userRef, {
            telegram_id: uid,
            first_name: ctx.from.first_name || '',
            username: ctx.from.username || '',
            phone_number: phoneNumber,
            balance: 0,
            bonus: REGISTRATION_BONUS,
            channel_joined: true,
            has_deposited: false,
            referral_code: uid,
            referred_by: referrerSnap?.exists ? referrerId : null,
            created_at: Date.now(),
            transactions: [{
                type: 'bonus',
                amount: REGISTRATION_BONUS,
                source: 'registration',
                timestamp: now
            }]
        });

        if (referrerSnap?.exists) {
            const rd = referrerSnap.data();

            const referred = Array.isArray(rd.referred_users)
                ? rd.referred_users
                : [];

            if (!referred.includes(uid)) {
                const txs = Array.isArray(rd.transactions)
                    ? rd.transactions
                    : [];

                txs.push({
                    type: 'bonus',
                    amount: REFERRAL_BONUS,
                    source: 'referral',
                    referred_user: uid,
                    timestamp: now
                });

                tx.update(referrerRef, {
                    bonus: Number(rd.bonus || 0) + REFERRAL_BONUS,
                    referred_users: [...referred, uid],
                    referral_count: Number(rd.referral_count || 0) + 1,
                    transactions: txs
                });
            }
        }

        tx.delete(pendingRef);
    });
}

bot.start(async ctx => {
    try {
        const uid = String(ctx.from.id);
        const payload = String(ctx.startPayload || '').toLowerCase();

        if (payload.startsWith('ref_')) {
            const referrerId = payload.slice(4).replace(/[^0-9]/g, '');

            if (referrerId && referrerId !== uid) {
                const existing = await db.collection('users').doc(uid).get();

                if (!existing.exists) {
                    await db.collection('pending_registrations')
                        .doc(uid)
                        .set({ referrer_id: referrerId }, { merge: true });
                }
            }
        }

        if (!await isChannelMember(ctx)) {
            return askToJoin(ctx);
        }

        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists || !userDoc.data().phone_number) {
            return askForContact(ctx);
        }

        await db.collection('users').doc(uid).set({
            channel_joined: true
        }, { merge: true });

        await showMainMenu(ctx);
    } catch (e) {
        console.error('/start error:', e);
        ctx.reply('âš ï¸ áŒŠá‹œá‹«á‹Š á‰½áŒáˆ­ á‰°áˆáŒ¥áˆ¯áˆá¢ áŠ¥á‰£áŠ­á‹Ž /start áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áˆ‹áŠ©á¢');
    }
});

bot.action('verify_channel', async ctx => {
    try {
        await ctx.answerCbQuery('á‰ áˆ˜áˆá‰°áˆ½ áˆ‹á‹­...').catch(() => {});

        if (!await isChannelMember(ctx)) {
            return ctx.reply('âŒ áŒˆáŠ“ á‰»áŠ“áˆ‰áŠ• áŠ áˆá‰°á‰€áˆ‹á‰€áˆ‰áˆá¢ á‰»áŠ“áˆ‰áŠ• á‹­á‰€áˆ‹á‰€áˆ‰áŠ“ áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áˆžáŠ­áˆ©á¢');
        }

        const uid = String(ctx.from.id);
        const doc = await db.collection('users').doc(uid).get();

        if (!doc.exists || !doc.data().phone_number) {
            return askForContact(ctx);
        }

        await db.collection('users').doc(uid).set({
            channel_joined: true
        }, { merge: true });

        await showMainMenu(ctx);
    } catch (e) {
        console.error('verify_channel error:', e);
        ctx.reply('âš ï¸ áŒŠá‹œá‹«á‹Š á‰½áŒáˆ­ á‰°áˆáŒ¥áˆ¯áˆá¢ áŠ¥á‰£áŠ­á‹Ž áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áˆžáŠ­áˆ©á¢');
    }
});

bot.on('contact', async ctx => {
    try {
        const contact = ctx.message.contact;

        if (!contact?.user_id || String(contact.user_id) !== String(ctx.from.id)) {
            return ctx.reply('âš ï¸ áŠ¥á‰£áŠ­á‹Ž á‹¨áˆ«áˆµá‹ŽáŠ• áˆµáˆáŠ­ á‰áŒ¥áˆ­ á‰¥á‰» á‹«áŒ‹áˆ©á¢');
        }

        if (!await isChannelMember(ctx)) {
            return askToJoin(ctx);
        }

        let phone = String(contact.phone_number || '').trim();
        if (!phone.startsWith('+')) {
            phone = `+${phone}`;
        }

        await completeRegistration(ctx, phone);
        await showMainMenu(ctx);
    } catch (e) {
        console.error('Contact registration error:', e);
        ctx.reply('âš ï¸ áˆá‹áŒˆá‰£á‹ áŠ áˆá‰°áˆ³áŠ«áˆá¢ áŠ¥á‰£áŠ­á‹Ž áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áˆžáŠ­áˆ©á¢');
    }
});

async function beginWalletFlow(ctx, action) {
    if (action === 'deposit') {
        ctx.session.flow = 'deposit_amount';
        return ctx.reply(`ðŸ’° áˆ‚áˆ³á‰¥ áˆˆáˆ˜áˆ™áˆ‹á‰µ á‹¨áŠ­áá‹« áŠ áˆ›áˆ«áŒ­: Telebirr\n\n${DEPOSIT_INSTRUCTIONS}\n\náŠ¥á‰£áŠ­á‹Ž á‹¨áˆšáˆáˆáŒ‰á‰µáŠ• áˆ˜áŒ áŠ• á‰ ETB á‹«áˆµáŒˆá‰¡ (áŠ áŠáˆµá‰°áŠ› ${DEPOSIT_MINIMUM} ETB)á¢\n/cancel áˆˆáˆ˜áˆ°áˆ¨á‹á¢`);
    }

    const ref = db.collection('users').doc(String(ctx.from.id));
    const snap = await ref.get();

    if (!snap.exists || !snap.data().has_deposited) {
        return ctx.reply('â›” áŒˆáŠ•á‹˜á‰¥ áˆˆáˆ›á‹áŒ£á‰µ áˆ˜áŒ€áˆ˜áˆªá‹« á‰¢á‹«áŠ•áˆµ áŠ áŠ•á‹µ áŒŠá‹œ Deposit áˆ›á‹µáˆ¨áŒ áŠ áˆˆá‰¥á‹Žá‰µá¢');
    }

    ctx.session.flow = 'withdraw_amount';

    return ctx.reply(`ðŸ“¤ áˆˆáˆ›á‹áŒ£á‰µ á‹¨áˆšáˆáˆáŒ‰á‰µáŠ• áˆ˜áŒ áŠ• á‰ ETB á‹«áˆµáŒˆá‰¡á¢\ná‹á‰…á‰°áŠ› Withdrawal: ${money(WITHDRAW_MINIMUM)}\nMain Balance: ${money(snap.data().balance)}\n/cancel áˆˆáˆ˜áˆ°áˆ¨á‹á¢`);
}

bot.command('cancel', ctx => {
    ctx.session.flow = null;
    ctx.session.depositAmount = null;
    ctx.session.withdrawAmount = null;
    ctx.session.withdrawName = null;
    ctx.session.withdrawAccount = null;

    ctx.reply('á‰°áˆ°áˆ­á‹Ÿáˆá¢');
});

bot.on('text', async ctx => {
    const flow = ctx.session?.flow;

    if (!flow || ctx.message.text.startsWith('/')) return;

    const amount = Number(ctx.message.text.replace(',', '.'));

    if (flow === 'deposit_proof') {
        const amountProof = Number(ctx.session.depositAmount || 0);

        if (!amountProof) {
            ctx.session.flow = null;
            return ctx.reply('Deposit áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áŒ€áˆáˆ©á¢');
        }

        const proofRef = db.collection('deposit_requests').doc();

        await proofRef.set({
            user_id: String(ctx.from.id),
            amount: amountProof,
            receipt_text: ctx.message.text.slice(0, 1500),
            status: 'pending',
            created_at: Date.now()
        });

        ctx.session.flow = null;
        ctx.session.depositAmount = null;

        await ctx.reply('âœ… á‹¨áŠ­áá‹« SMS/Transaction áˆ˜áˆ¨áŒƒá‹Ž á‰°áˆáŠ³áˆá¢ áŠ á‹µáˆšáŠ‘ áŠ«áˆ¨áŒ‹áŒˆáŒ á‹ á‰ áŠ‹áˆ‹ Bonus Balance á‹­áŒ¨áˆ˜áˆ«áˆá¢');

        for (const aid of ADMIN_ID_LIST) {
            await bot.telegram.sendMessage(
                aid,
                `ðŸ“¥ Deposit request\nUser: ${ctx.from.id}\nAmount: ${money(amountProof)}\nSMS: ${ctx.message.text.slice(0, 1000)}\nRequest: ${proofRef.id}`,
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback('âœ… Approve', `dp_ok_${proofRef.id}`),
                        Markup.button.callback('âŒ Reject', `dp_no_${proofRef.id}`)
                    ]
                ])
            ).catch(() => {});
        }

        return;
    }

    if (flow === 'withdraw_details') {
        const parts = ctx.message.text.trim().split(/\s*\|\s*/);

        if (parts.length < 2 || parts[0].length < 2 || parts[1].length < 5) {
            return ctx.reply('áŠ¥á‰£áŠ­á‹Ž á‰ á‹šáˆ… á‰…áˆ­áŒ½ á‹­áˆ‹áŠ©á¦ áˆµáˆ | Telebirr á‰áŒ¥áˆ­\náˆáˆ³áˆŒ: Natnael | 09XXXXXXXX');
        }

        ctx.session.withdrawName = parts[0].slice(0, 80);
        ctx.session.withdrawAccount = parts[1].slice(0, 40);
        ctx.session.flow = 'withdraw_confirm';

        return ctx.reply(`áŠ¥á‰£áŠ­á‹Ž á‹¨Withdrawal áˆ˜áˆ¨áŒƒá‹ŽáŠ• á‹«áˆ¨áŒ‹áŒáŒ¡á¦\náˆµáˆ: ${ctx.session.withdrawName}\nTelebirr: ${ctx.session.withdrawAccount}\n\náˆˆáˆ˜á‰€áŒ áˆ CONFIRM á‹­áŒ»á‰á£ áˆˆáˆ˜áˆ°áˆ¨á‹ /cancel á‹­áŒ»á‰á¢`);
    }

    if (flow === 'withdraw_confirm') {
        if (ctx.message.text.trim().toUpperCase() !== 'CONFIRM') {
            return ctx.reply('áˆˆáˆ›áˆ¨áŒ‹áŒˆáŒ¥ CONFIRM á‹­áŒ»á‰ á‹ˆá‹­áˆ /cancel á‹­áŒ á‰€áˆ™á¢');
        }

        const uid = String(ctx.from.id);
        const amount2 = Number(ctx.session.withdrawAmount || 0);
        const userRef = db.collection('users').doc(uid);
        const requestRef = db.collection('withdrawal_requests').doc();

        try {
            await db.runTransaction(async tx => {
                const us = await tx.get(userRef);

                if (!us.exists) throw new Error('USER_NOT_FOUND');

                const d = us.data();

                if (!d.has_deposited) throw new Error('DEPOSIT_REQUIRED');

                if (Number(d.balance || 0) < amount2) {
                    throw new Error('INSUFFICIENT_BALANCE');
                }

                tx.update(userRef, {
                    balance: Number(d.balance || 0) - amount2,
                    transactions: [
                        ...(d.transactions || []),
                        {
                            type: 'withdrawal_pending',
                            amount: amount2,
                            request_id: requestRef.id,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });

                tx.set(requestRef, {
                    user_id: uid,
                    player_name: d.first_name || ctx.from.first_name || '',
                    username: d.username || ctx.from.username || '',
                    phone_number: d.phone_number || '',
                    payout_name: ctx.session.withdrawName,
                    payout_account: ctx.session.withdrawAccount,
                    payment_method: 'Telebirr',
                    amount: amount2,
                    status: 'pending',
                    created_at: Date.now()
                });
            });

            ctx.session.flow = null;
            ctx.session.withdrawAmount = null;

            await ctx.reply('âœ… á‹¨Withdrawal áŒ¥á‹«á‰„á‹Ž á‹ˆá‹° Admin Panel á‰°áˆáŠ³áˆá¢ áŠ á‹µáˆšáŠ‘ áŠ«áŒ¸á‹°á‰€ á‰ áŠ‹áˆ‹ áŠ­áá‹«á‹áŠ• á‰ Telebirr á‹­áˆáŠ«áˆá¢');

            const saved = await requestRef.get();

            for (const aid of ADMIN_ID_LIST) {
                await bot.telegram.sendMessage(
                    aid,
                    `ðŸ“¤ Withdrawal request\nUser: ${uid}\nName: ${saved.data()?.payout_name}\nTelebirr: ${saved.data()?.payout_account}\nAmount: ${money(amount2)}\nRequest: ${requestRef.id}`,
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback('âœ… Approve', `wd_ok_${requestRef.id}`),
                            Markup.button.callback('âŒ Reject', `wd_no_${requestRef.id}`)
                        ]
                    ])
                ).catch(() => {});
            }
        } catch (e) {
            ctx.session.flow = null;
            ctx.session.withdrawAmount = null;

            return ctx.reply(
                e.message === 'INSUFFICIENT_BALANCE'
                    ? 'âŒ Main Balance á‰ á‰‚ áŠ á‹­á‹°áˆˆáˆá¢'
                    : 'âš ï¸ Withdrawal áŠ áˆá‰°áˆ³áŠ«áˆá¢'
            );
        }

        return;
    }

    if (flow === 'deposit_amount' || flow === 'withdraw_amount') {
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
            return ctx.reply('áŠ¥á‰£áŠ­á‹Ž á‰µáŠ­áŠ­áˆˆáŠ› á‹¨ETB áˆ˜áŒ áŠ• á‹«áˆµáŒˆá‰¡á¢');
        }
    }

    if (flow === 'deposit_amount') {
        if (amount < DEPOSIT_MINIMUM) {
            return ctx.reply(`âŒ áŠ áŠáˆµá‰°áŠ› Deposit ${DEPOSIT_MINIMUM} ETB áŠá‹á¢ áŠ¥á‰£áŠ­á‹Ž áŠ¥áŠ•á‹°áŒˆáŠ“ á‹«áˆµáŒˆá‰¡á¢`);
        }

        ctx.session.flow = null;
        ctx.session.depositAmount = Math.round(amount * 100) / 100;
        ctx.session.flow = 'deposit_proof';

        return ctx.reply(
            `á‹¨Deposit áˆ˜áŒ áŠ• ${money(amount)} á‰°á‰€á‰¥áˆˆáŠ“áˆá¢ áŠ¥á‰£áŠ­á‹Ž á‹¨áŠ­áá‹« SMS áŒ½áˆ‘á á‹ˆá‹­áˆ á‹¨á‹°áˆ¨áˆ°áŠ áŽá‰¶ (Screenshot) á‹­áˆ‹áŠ©á¢`
        );
    }

    if (flow === 'withdraw_amount') {
        if (amount < WITHDRAW_MINIMUM) {
            return ctx.reply(`âŒ á‹á‰…á‰°áŠ› Withdrawal ${WITHDRAW_MINIMUM} ETB áŠá‹á¢`);
        }

        const amount2 = Math.round(amount * 100) / 100;
        const snap = await db.collection('users').doc(String(ctx.from.id)).get();

        if (!snap.exists || Number(snap.data().balance || 0) < amount2) {
            return ctx.reply('âŒ Main Balance á‰ á‰‚ áŠ á‹­á‹°áˆˆáˆá¢');
        }

        ctx.session.withdrawAmount = amount2;
        ctx.session.flow = 'withdraw_details';

        return ctx.reply('á‹¨Telebirr á‰°á‰€á‰£á‹­ áˆµáˆá‹ŽáŠ• áŠ¥áŠ“ á‰áŒ¥áˆ­á‹ŽáŠ• á‰ á‹šáˆ… á‰…áˆ­áŒ½ á‹­áˆ‹áŠ©á¦\náˆµáˆ | 09XXXXXXXX');
    }
});

bot.on('photo', async ctx => {
    if (ctx.session?.flow !== 'deposit_proof') return;

    const amount = Number(ctx.session.depositAmount || 0);

    if (!amount) {
        ctx.session.flow = null;
        return ctx.reply('áŠ¥á‰£áŠ­á‹Ž Deposit áŠ¥áŠ•á‹°áŒˆáŠ“ á‹­áŒ€áˆáˆ©á¢');
    }

    const ref = db.collection('deposit_requests').doc();

    await ref.set({
        user_id: String(ctx.from.id),
        amount,
        photo_file_id: ctx.message.photo.at(-1).file_id,
        status: 'pending',
        created_at: Date.now()
    });

    ctx.session.flow = null;
    ctx.session.depositAmount = null;

    await ctx.reply(
        'âœ… á‹¨Deposit áˆ›áˆ¨áŒ‹áŒˆáŒ«á‹Ž á‰°áˆáŠ³áˆá¢ áŠ á‹µáˆšáŠ‘ áŠ«áˆ¨áŒ‹áŒˆáŒ á‹ á‰ áŠ‹áˆ‹ Bonus Balance á‹­áŒ¨áˆ˜áˆ«áˆá¢'
    );

    for (const aid of ADMIN_ID_LIST) {
        await bot.telegram.sendPhoto(
            aid,
            ctx.message.photo.at(-1).file_id,
            {
                caption:
                    `ðŸ“¥ Deposit request\n` +
                    `User: ${ctx.from.id}\n` +
                    `Amount: ${money(amount)}\n` +
                    `Request: ${ref.id}`,
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('âœ… Approve', `dp_ok_${ref.id}`),
                        Markup.button.callback('âŒ Reject', `dp_no_${ref.id}`)
                    ]
                ])
            }
        );
    }
});

async function reviewRequest(ctx, type, id, approve) {
    if (!isAdmin(ctx)) {
        return ctx.answerCbQuery('Not authorized', { show_alert: true });
    }

    const collection = type === 'deposit'
        ? 'deposit_requests'
        : 'withdrawal_requests';

    const reqRef = db.collection(collection).doc(id);

    try {
        await db.runTransaction(async tx => {
            const reqSnap = await tx.get(reqRef);

            if (!reqSnap.exists || reqSnap.data().status !== 'pending') {
                throw new Error('ALREADY_PROCESSED');
            }

            const r = reqSnap.data();

            const userRef = db.collection('users').doc(String(r.user_id));
            const userSnap = await tx.get(userRef);

            if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

            const d = userSnap.data();

            if (type === 'deposit' && approve) {
                tx.update(userRef, {
                    bonus: Number(d.bonus || 0) + Number(r.amount),
                    has_deposited: true,
                    first_deposit_at: d.first_deposit_at || Date.now(),
                    transactions: [
                        ...(d.transactions || []),
                        {
                            type: 'deposit',
                            wallet: 'bonus',
                            amount: Number(r.amount),
                            request_id: id,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
            }

            if (type === 'withdrawal' && !approve) {
                tx.update(userRef, {
                    balance: Number(d.balance || 0) + Number(r.amount),
                    transactions: [
                        ...(d.transactions || []),
                        {
                            type: 'withdrawal_refund',
                            amount: Number(r.amount),
                            request_id: id,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });
            }

            tx.update(reqRef, {
                status: approve ? 'approved' : 'rejected',
                reviewed_at: Date.now(),
                reviewed_by: String(ctx.from.id)
            });
        });

        await ctx.answerCbQuery(approve ? 'Approved' : 'Rejected');

        await ctx.editMessageCaption(
            `${ctx.callbackQuery.message.caption || ''}\n\nStatus: ${approve ? 'APPROVED' : 'REJECTED'}`
        ).catch(() =>
            ctx.editMessageText(
                `${ctx.callbackQuery.message.text || ''}\n\nStatus: ${approve ? 'APPROVED' : 'REJECTED'}`
            ).catch(() => {})
        );

        const snap = await reqRef.get();

        const reviewed = snap.data() || {};
        const amountLabel = money(reviewed.amount || 0);

        const notice = type === 'deposit'
            ? `${approve ? 'âœ… DEPOSIT APPROVED' : 'âŒ DEPOSIT REJECTED'}\nAmount: ${amountLabel}\nReference: ${reviewed.reference || id}\n${approve ? 'Bonus Balance áˆ‹á‹­ á‰°áŒ¨áˆáˆ¯áˆá¢' : 'áŠ¥á‰£áŠ­á‹Ž á‹¨áŠ­áá‹« áˆ˜áˆ¨áŒƒá‹áŠ• á‹«áˆ¨áŒ‹áŒáŒ¡á¢'}`
            : `${approve ? 'âœ… WITHDRAWAL APPROVED' : 'âŒ WITHDRAWAL REJECTED'}\nAmount: ${amountLabel}\nRequest ID: ${id}\n${approve ? 'Admin á‰ Telebirr áŠ­áá‹«á‹áŠ• á‹­áˆáŠ«áˆá¢' : 'áŒˆáŠ•á‹˜á‰¡ á‹ˆá‹° Main Balance á‰°áˆ˜áˆáˆ·áˆá¢'}`;

        await bot.telegram.sendMessage(
            String(reviewed.user_id),
            notice
        ).catch(err => console.warn('wallet review notification failed:', err.message));
    } catch (e) {
        await ctx.answerCbQuery(
            e.message === 'ALREADY_PROCESSED'
                ? 'Already processed'
                : 'Could not process',
            { show_alert: true }
        );
    }
}

bot.action(/^dp_ok_(.+)$/, ctx =>
    reviewRequest(ctx, 'deposit', ctx.match[1], true)
);

bot.action(/^dp_no_(.+)$/, ctx =>
    reviewRequest(ctx, 'deposit', ctx.match[1], false)
);

bot.action(/^wd_ok_(.+)$/, ctx =>
    reviewRequest(ctx, 'withdrawal', ctx.match[1], true)
);

bot.action(/^wd_no_(.+)$/, ctx =>
    reviewRequest(ctx, 'withdrawal', ctx.match[1], false)
);

bot.launch()
    .then(() => console.log('Telegram Bot polling started.'))
    .catch(err => console.error('Telegram bot launch failed:', err.message));

bot.catch((err, ctx) =>
    console.error('Telegram bot handler error:', err, 'update:', ctx.updateType)
);

module.exports = bot;
