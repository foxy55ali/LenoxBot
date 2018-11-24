const Discord = require("discord.js");
const mongodb = require("mongodb");
const assert = require("assert");
const Commando = require("discord.js-commando");

module.exports = class LenoxBotSettingsProvider extends Commando.SettingProvider { 

    constructor(settings) {
        super();
        const url = `mongodb://${encodeURIComponent(settings.db.user)}:${encodeURIComponent(settings.db.password)}@${encodeURIComponent(settings.db.host)}:${encodeURIComponent(settings.db.port)}/?authMechanism=DEFAULT`;

        this.dbClient = new mongodb.MongoClient(url);
        this.guildSettings = new Map();
        this.listeners = new Map();
    }
    
    async init(client) {
        this.dbClient.connect(function(err) {
            assert.strictEqual(null, err);
            console.log("Connected to mongodb");

            this.db = this.dbClient.db("lenoxbot");
            const settingsCollection = db.collection('guildSettings');

            settingsCollection.createIndex("guildId", {unique: true});

            client.guilds.every(function(guild) {
                settingsCollection.findOne({'guildId': guild.id}).then((err, result) => {
                    if(err) {
                        //Can't find DB make new one.
                        settings = {};
                    }

                    if(typeof result.settings !== 'undefined') {
                        settings = result.settings;
                    }

                    this.guildSettings.set(guild.id, settings);
                })
                settingsCollection.findOne({'guildId': "global"}).then((err, result) => {
                    if(err) {
                        //Could not load global, do new one
                        settings = {};
                        this.setupGuild("global", settings);
                    }

                    if(typeof result.settings !== 'undefined') {
                        settings = result.settings;
                    }

                    this.guildSettings.set("global", settings);
                });
            });
        });

        this.listeners
        .set('commandPrefixChange', (guild, prefix) => this.set(guild, 'prefix', prefix))
        .set('commandStatusChange', (guild, command, enabled) => this.set(guild, `cmd-${command.name}`, enabled))
        .set('groupStatusChange', (guild, group, enabled) => this.set(guild, `grp-${group.id}`, enabled))
        .set('guildCreate', guild => {
            const settings = this.guildSettings.get(guild.id);
            if(!settings) return;
            this.setupGuild(guild.id, settings);
        })
        .set('commandRegister', command => {
            for(const [guild, settings] of this.guildSettings) {
                if(guild !== 'global' && !client.guilds.has(guild)) continue;
                this.setupGuildCommand(client.guilds.get(guild), command, settings);
            }
        })
        .set('groupRegister', group => {
            for(const [guild, settings] of this.guildSettings) {
                if(guild !== 'global' && !client.guilds.has(guild)) continue;
                this.setupGuildGroup(client.guilds.get(guild), group, settings);
            }
        });
        for(const [event, listener] of this.listeners) client.on(event, listener);
    }

    async destroy() {
        // Remove all listeners from the client
		for(const [event, listener] of this.listeners) this.client.removeListener(event, listener);
        this.listeners.clear();
    }

    async set(guild, key, val) {
        guild = this.constructor.getGuildID(guild);
        let settings = this.guildSettings.get(guild);
        if(!settings) {
			settings = {};
			this.guildSettings.set(guild, settings);
        }

        settings[key] = val;
        const settingsCollection = this.db.collection('guildSettings');

        await settingsCollection.save({'guildId': guild, 'settings': settings});
        return val;
    }

    async remove(guild, key, val) {
        guild = this.constructor.getGuildID(guild);
        let settings = this.guildSettings.get(guild);
        if(!settings) {
			settings = {};
			this.guildSettings.set(guild, settings);
        }

        const val = settings[key];
        settings[key] = undefined;
        const settingsCollection = this.db.collection('guildSettings');

        await settingsCollection.save({'guildId': guild, 'settings': settings});
        return val;
    }

    
	async clear(guild) {
		guild = this.constructor.getGuildID(guild);
		if(!this.settings.has(guild)) return;
        this.settings.delete(guild);
        const settingsCollection = this.db.collection('guildSettings');
		await this.settingsCollection.deleteOne({'guildId': guild});
    }

    get(guild, key, defVal) {
        const settings = this.guildSettings.get(this.constructor.getGuildID(guild));
        return settings ? typeof settings[key] !== 'undefined' ? settings[key] : defVal : defVal;
    }

    getDatabase() {
        return this.db;
    }

    /**
     * Sets the guild up in the db for usage.
     * @param {snowflake} guildId 
     * @param {object containing properties} settings 
     */
    setupGuild(guild, settings) {
        if(typeof guild !== 'string') throw new TypeError('The guild must be a guild ID or "global".');
		guild = this.client.guilds.get(guild) || null;

		// Load the command prefix
		if(typeof settings.prefix !== 'undefined') {
			if(guild) guild._commandPrefix = settings.prefix;
			else this.client._commandPrefix = settings.prefix;
		}

		// Load all command/group statuses
		for(const command of this.client.registry.commands.values()) this.setupGuildCommand(guild, command, settings);
        for(const group of this.client.registry.groups.values()) this.setupGuildGroup(guild, group, settings);
    }

    setupGuildCommand(guild, command, settings) {
        if(typeof settings[`cmd-${command.name}`] === 'undefined') return;
        if(guild) {
            if(!guild._commandsEnabled) guild._commandsEnabled = {};
            guild._commandsEnabled[command.name] = settings[`cmd-${command.name}`]
        } else {
            command._globalEnabled = settings[`cmd-${command.name}`]
        }
    }

    setupGuildGroup(guild, command, setting) {
		if(typeof settings[`grp-${group.id}`] === 'undefined') return;
		if(guild) {
			if(!guild._groupsEnabled) guild._groupsEnabled = {};
			guild._groupsEnabled[group.id] = settings[`grp-${group.id}`];
		} else {
			group._globalEnabled = settings[`grp-${group.id}`];
        }
    }
}