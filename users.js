class FirestoreWallet {
    constructor(db) {
        this.db = db;
        this.cache = new Map();
    }

    cache_set(userId, balance, bonus) {
        this.cache.set(String(userId), { balance: Number(balance), bonus: Number(bonus), at: Date.now() });
    }

    cache_drop(userId) {
        this.cache.delete(String(userId));
    }

    get_wallets(userId) {
        const cached = this.cache.get(String(userId));
        if (cached && Date.now() - cached.at < 60000) {
            return [cached.balance, cached.bonus];
        }
        return null;
    }

    async get_balance(userId) {
        const doc = await this.db.collection('users').doc(String(userId)).get();
        if (!doc.exists) return 0.0;
        const data = doc.data();
        const balance = Number(data.balance || 0);
        const bonus = Number(data.bonus || 0);
        this.cache_set(userId, balance, bonus);
        return balance + bonus;
    }

    async begin_round(roundId, snapshot) {
        await this.db.collection('rounds').doc(String(roundId)).set({
            status: 'locked',
            snapshot: snapshot,
            at: new Date().toISOString()
        });
    }

    async charge(userId, amount, roundId, cartels = 1) {
        amount = Number(amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const userRef = this.db.collection('users').doc(String(userId));

        const res = await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return null;

            const data = userDoc.data();
            const balance = Number(data.balance || 0);
            const bonus = Number(data.bonus || 0);
            const txs = Array.isArray(data.transactions) ? [...data.transactions] : [];

            // Make charging idempotent across retries for the same round.
            const existingPlay = txs.find(t =>
                t && t.type === 'play' && String(t.round_id) === String(roundId)
            );
            if (existingPlay) {
                // A refunded play must never become chargeable again on retry.
                const alreadyRefunded = txs.some(t =>
                    t && t.type === 'refund' && String(t.round_id) === String(roundId)
                );
                if (alreadyRefunded) return null;

                const previousAmount = Number(existingPlay.amount || 0);
                if (Math.abs(previousAmount - amount) > 1e-9) return null;
                return { balance, bonus };
            }

            if (balance + bonus + 1e-9 < amount) return null;

            const fromBonus = Math.min(bonus, amount);
            const fromMain = amount - fromBonus;
            const newBalance = Math.max(0, balance - fromMain);
            const newBonus = Math.max(0, bonus - fromBonus);
            const weeklyCartels = (Number(data.weekly_cartels) || 0) + cartels;

            txs.push({
                type: 'play',
                amount,
                bonus_amount: fromBonus,
                main_amount: fromMain,
                round_id: roundId,
                timestamp: new Date().toISOString()
            });

            transaction.update(userRef, {
                balance: newBalance,
                bonus: newBonus,
                weekly_cartels: weeklyCartels,
                transactions: txs
            });

            return { balance: newBalance, bonus: newBonus };
        });

        if (res !== null) this.cache_drop(userId);
        return res;
    }

    async refund(userId, roundId) {
        roundId = String(roundId);
        const userRef = this.db.collection('users').doc(String(userId));

        await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return;

            const data = userDoc.data();
            const txs = Array.isArray(data.transactions) ? [...data.transactions] : [];
            const roundTx = txs.find(t =>
                t && String(t.round_id) === roundId && t.type === 'play'
            );
            const alreadyRefunded = txs.some(t =>
                t && String(t.round_id) === roundId && t.type === 'refund'
            );

            if (!roundTx || alreadyRefunded) return;

            const bonusRefund = Number(roundTx.bonus_amount || 0);
            const mainRefund = roundTx.main_amount == null
                ? Number(roundTx.amount || 0)
                : Number(roundTx.main_amount || 0);

            transaction.update(userRef, {
                balance: Number(data.balance || 0) + mainRefund,
                bonus: Number(data.bonus || 0) + bonusRefund,
                transactions: [...txs, {
                    type: 'refund',
                    amount: bonusRefund + mainRefund,
                    bonus_amount: bonusRefund,
                    main_amount: mainRefund,
                    round_id: roundId,
                    timestamp: new Date().toISOString()
                }]
            });
        });

        this.cache_drop(userId);
    }

    async add_bonus(userId, amount, source = 'bonus') {
        amount = Number(amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('Bonus amount must be greater than zero.');
        }

        const userRef = this.db.collection('users').doc(String(userId));

        await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error('User not found.');

            const data = userDoc.data();
            const txs = Array.isArray(data.transactions) ? [...data.transactions] : [];

            txs.push({
                type: 'bonus',
                amount,
                source,
                timestamp: new Date().toISOString()
            });

            transaction.update(userRef, {
                bonus: Number(data.bonus || 0) + amount,
                transactions: txs
            });
        });

        this.cache_drop(userId);
    }

    async start_drawing(roundId, tickets, gameState) {
        const roundRef = this.db.collection('rounds').doc(String(roundId));

        await this.db.runTransaction(async transaction => {
            const roundDoc = await transaction.get(roundRef);

            if (!roundDoc.exists) {
                throw new Error(`Round ${String(roundId)} does not exist.`);
            }

            if (roundDoc.data().status !== 'locked') {
                throw new Error(
                    `Cannot start drawing for round ${String(roundId)} with status ${roundDoc.data().status}.`
                );
            }

            transaction.update(roundRef, {
                status: 'drawing',
                tickets,
                game_state: gameState,
                game_state_saved_at: new Date().toISOString()
            });
        });
    }

    async save_drawing_state(roundId, gameState) {
        const roundRef = this.db.collection('rounds').doc(String(roundId));

        await this.db.runTransaction(async transaction => {
            const roundDoc = await transaction.get(roundRef);

            if (!roundDoc.exists || roundDoc.data().status !== 'drawing') {
                throw new Error(
                    `Cannot save drawing state for round ${String(roundId)}.`
                );
            }

            transaction.update(roundRef, {
                game_state: gameState,
                game_state_saved_at: new Date().toISOString()
            });
        });
    }

    async prepare_settlement(roundId, payouts) {
        await this.db.collection('rounds').doc(String(roundId)).set({
            status: 'settling',
            payouts,
            settlement_started_at: new Date().toISOString()
        }, { merge: true });
    }

    async settle(roundId, payouts) {
        const roundRef = this.db.collection('rounds').doc(String(roundId));

        for (const [userId, rawAmount] of Object.entries(payouts || {})) {
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) continue;

            const userRef = this.db.collection('users').doc(String(userId));

            await this.db.runTransaction(async transaction => {
                const roundDoc = await transaction.get(roundRef);
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) return;

                const roundData = roundDoc.exists ? roundDoc.data() : {};
                const settledUsers = roundData.settled_users || {};

                if (Object.prototype.hasOwnProperty.call(settledUsers, String(userId))) {
                    return;
                }

                const data = userDoc.data();
                const transactions = Array.isArray(data.transactions) ? [...data.transactions] : [];

                transactions.push({
                    type: 'win',
                    amount,
                    round_id: String(roundId),
                    timestamp: new Date().toISOString()
                });

                transaction.update(userRef, {
                    balance: Number(data.balance || 0) + amount,
                    total_winnings: Number(data.total_winnings || 0) + amount,
                    transactions
                });

                transaction.set(roundRef, {
                    status: 'settling',
                    settled_users: {
                        ...settledUsers,
                        [String(userId)]: amount
                    }
                }, { merge: true });
            });

            this.cache_drop(userId);
        }

        await roundRef.set({
            status: 'settled',
            settled_at: new Date().toISOString()
        }, { merge: true });
    }

    async cancel_round(roundId, userIds) {
        for (const uid of [...new Set((userIds || []).map(String))]) {
            await this.refund(uid, String(roundId));
        }

        await this.db.collection('rounds').doc(String(roundId)).set({
            status: 'cancelled',
            cancelled_at: new Date().toISOString()
        }, { merge: true });
    }

    async profile(userId) {
        const doc = await this.db.collection('users').doc(String(userId)).get();
        return doc.exists ? doc.data() : null;
    }

    async recover_unsettled() {
        const snapshot = await this.db.collection('rounds').get();
        let recovered = 0;
        let activeRound = null;

        for (const doc of snapshot.docs) {
            const round = doc.data() || {};
            if (!['locked', 'drawing', 'settling'].includes(round.status)) continue;

            if (round.status === 'settling' && round.payouts &&
                typeof round.payouts === 'object') {
                await this.settle(doc.id, round.payouts);
                recovered++;
                continue;
            }

            const state = round.game_state;
            const tickets = round.tickets || {};
            const order = state && state.draw_order;
            const drawn = state && state.drawn;

            const validOrder =
                Array.isArray(order) &&
                order.length === 75 &&
                order.every(n => Number.isInteger(n) && n >= 1 && n <= 75) &&
                new Set(order).size === 75;

            const validDrawn =
                Array.isArray(drawn) &&
                drawn.length <= 75 &&
                validOrder &&
                drawn.every((n, i) => n === order[i]);

            const validPhase =
                state && ['drawing', 'settling'].includes(state.phase);

            const validPending =
                state && (
                    (state.phase === 'drawing' && state.pending == null) ||
                    (state.phase === 'settling' &&
                        Array.isArray(state.pending) &&
                        (
                            (state.pending[0] === 'win' &&
                                Array.isArray(state.pending[1]) &&
                                state.pending[1].length > 0) ||
                            (state.pending[0] === 'none' &&
                                Array.isArray(state.pending[1]) &&
                                state.pending[1].length === 0)
                        ))
                );

            const validTiming =
                state &&
                (state.phase === 'settling' ||
                    (Number.isFinite(state.next_draw_at) &&
                        state.next_draw_at > 0));

            const validTickets =
                tickets &&
                typeof tickets === 'object' &&
                !Array.isArray(tickets) &&
                Object.keys(tickets).length > 0 &&
                Object.entries(tickets).every(([cartel, uid]) =>
                    /^\d+$/.test(cartel) &&
                    Number(cartel) >= 1 &&
                    Number(cartel) <= 500 &&
                    (/^\d+$/.test(String(uid)) || /^bot_\d+$/.test(String(uid)))
                );

            const canResume =
                round.status === 'drawing' &&
                validTickets &&
                validOrder &&
                validDrawn &&
                validPhase &&
                validPending &&
                validTiming;

            if (canResume && activeRound === null) {
                activeRound = {
                    round_id: doc.id,
                    tickets,
                    game_state: state
                };
                recovered++;
                console.log(`Found resumable drawing round ${doc.id}.`);
                continue;
            }

            // Refund locked, invalid, or additional unfinished rounds.
            const ticketMap = round.tickets || round.snapshot || {};
            const userIds = [...new Set(Object.values(ticketMap).map(String))];
            await this.cancel_round(doc.id, userIds);
            recovered++;
        }

        console.log(`Recovered ${recovered} unfinished round(s).`);
        if (activeRound) {
            console.log(`One drawing round will resume: ${activeRound.round_id}`);
        }
        return activeRound;
    }
}

module.exports = FirestoreWallet;
