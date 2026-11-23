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

        const roundKey = String(roundId);
        const userRef = this.db.collection('users').doc(String(userId));

        const res = await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return null;

            const data = userDoc.data();
            const txs = Array.isArray(data.transactions) ? [...data.transactions] : [];

            const previousPlay = txs.find(t =>
                String(t.round_id) === roundKey && t.type === 'play'
            );
            const alreadyRefunded = txs.some(t =>
                String(t.round_id) === roundKey && t.type === 'refund'
            );

            if (previousPlay) {
                if (alreadyRefunded) return null;

                const previousAmount = Number(previousPlay.amount || 0);
                if (Math.abs(previousAmount - amount) > 1e-9) {
                    throw new Error(`Round ${roundKey} charge amount mismatch.`);
                }

                return {
                    balance: Number(data.balance || 0),
                    bonus: Number(data.bonus || 0),
                    already_charged: true
                };
            }

            const balance = Number(data.balance || 0);
            const bonus = Number(data.bonus || 0);

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
                round_id: roundKey,
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
        const roundKey = String(roundId);
        const userRef = this.db.collection('users').doc(String(userId));

        await this.db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) return;

            const data = userDoc.data();
            const txs = Array.isArray(data.transactions) ? [...data.transactions] : [];
            const roundTx = txs.find(t => String(t.round_id) === roundKey && t.type === 'play');
            const alreadyRefunded = txs.some(t => String(t.round_id) === roundKey && t.type === 'refund');

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
                    round_id: roundKey,
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

    async start_drawing(roundId, tickets) {
        await this.db.collection('rounds').doc(String(roundId)).update({
            status: 'drawing',
            tickets
        });
    }

    async prepare_settlement(roundId, payouts) {
        const roundRef = this.db.collection('rounds').doc(String(roundId));

        await this.db.runTransaction(async transaction => {
            const roundDoc = await transaction.get(roundRef);

            if (!roundDoc.exists) {
                throw new Error(`Round ${String(roundId)} does not exist.`);
            }

            const roundData = roundDoc.data();

            if (!['drawing', 'settling'].includes(roundData.status)) {
                throw new Error(
                    `Cannot prepare settlement for round ${String(roundId)} with status ${roundData.status}.`
                );
            }

            transaction.update(roundRef, {
                status: 'settling',
                payouts,
                settlement_started_at:
                    roundData.settlement_started_at || new Date().toISOString()
            });
        });
    }

    async settle(roundId, payouts) {
        const roundRef = this.db.collection('rounds').doc(String(roundId));

        for (const [userId, rawAmount] of Object.entries(payouts || {})) {
            const amount = Number(rawAmount);
            if (!Number.isFinite(amount) || amount <= 0) continue;

            const userRef = this.db.collection('users').doc(String(userId));

            await this.db.runTransaction(async transaction => {
                const roundDoc = await transaction.get(roundRef);
                if (!roundDoc.exists) return;

                const roundData = roundDoc.data();
                if (roundData.status !== 'settling') return;

                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error(`Settlement user ${userId} does not exist.`);
                }

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
                    won_after_deposit: Boolean(data.won_after_deposit || data.has_deposited),
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

        await this.db.runTransaction(async transaction => {
            const roundDoc = await transaction.get(roundRef);
            if (!roundDoc.exists) {
                throw new Error(`Round ${String(roundId)} does not exist.`);
            }

            if (roundDoc.data().status !== 'settling') return;

            transaction.set(roundRef, {
                status: 'settled',
                settled_at: new Date().toISOString()
            }, { merge: true });
        });
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

        for (const doc of snapshot.docs) {
            const round = doc.data() || {};
            if (!['locked', 'drawing', 'settling'].includes(round.status)) continue;

            // A prepared settlement is safe to resume because each user's payout
            // is recorded transactionally and cannot be credited twice.
            if (round.status === 'settling' && round.payouts &&
                typeof round.payouts === 'object') {
                await this.settle(doc.id, round.payouts);
            } else {
                // If the process stopped before a complete payout was prepared,
                // refund every charged participant. refund() is idempotent.
                const ticketMap = round.tickets || round.snapshot || {};
                const userIds = [...new Set(Object.values(ticketMap).map(String))];
                await this.cancel_round(doc.id, userIds);
            }

            recovered++;
        }

        console.log(`Recovered ${recovered} unfinished round(s).`);
        return recovered;
    }
}

module.exports = FirestoreWallet;
