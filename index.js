module.exports = function(){
    var xmpp = require("node-xmpp");
    var EventEmitter = require('events').EventEmitter;
    var eventEmitter = new EventEmitter();
    var self = this;

    this.name = 'hipchat';
    this.displayname = 'Hipchat';
    this.description = 'Send messages to woodhouse via Hipchat';

    this.defaultPrefs = [{
        name: 'jid',
        type: 'text',
        value: ''
    },{
        name: 'password',
        type: 'password',
        value: ''
    },{
        name: 'host',
        type: 'text',
        value: ''
    }];

    this.init = function() {
        var self = this;
        this.users = {};

        this.getPrefs().done(function(prefs){
            self.client = new xmpp.Client({
                jid: prefs.jid,
                password: prefs.password,
                host: prefs.host
            });

            self.client.on('error', function(error){
                console.log('ERROR:');
                console.dir(error);
            })

            self.client.connection.socket.setTimeout(0)
            self.client.connection.socket.setKeepAlive(true, 10000)

            self.keepalive = setInterval(function() {
                self.client.send(new xmpp.Element('r'));
              }, 10000);
            self.client.on('online', function() {
                self.client.send(new xmpp.Element('presence', {})
                    .c('show')
                    .t('chat')
                    .up()
                    .c('status')
                    .t('Online')
                );
                self.getProfile(function(profile){
                    self.botname = profile.fn;
                    self.nickname = profile.nickname;
                });

                self.addMessageSender(function(message, to){
                    self.sendStanza(to, message);
                });
            });

            self.client.on('stanza', function(stanza) {
                self.recieveStanza(stanza);
            })

            self.iqCount = 1
        });
    }

    this.getProfile = function(callback){
        var message = new xmpp.Element("iq", {
                type: "get"
            }).c("vCard", {
                xmlns: "vcard-temp"
            });

        this.sendIq(message, function(err, data){
            var profile = {};

            if (!err) {
                var vCardData = data.getChild('vCard').children;
                for (var i = 0, len = vCardData.length; i < len; i++) {
                    profile[vCardData[i].name.toLowerCase()] = vCardData[i].getText();
                }
            }
            callback(profile);
        });
    }



    this.sendIq = function(message, callback){
        var id = this.iqCount++;
        message = message.root();
        message.attrs.id = id;
        eventEmitter.once("iq:" + id, callback);
        this.client.send(message);
    }

    this.joinRoom = function(room){
        var packet, x;
        packet = new xmpp.Element("presence", {
          to: "" + room + "/" + "Woodhouse Bot"
        });
        x = packet.c("x", {
          xmlns: "http://jabber.org/protocol/muc"
        });
        x.c("history", {
          maxstanzas: String(0)
        });
        this.client.send(packet);
    }

    this.sendStanza = function(to, message) {
        var packet, parsedJid;
        parsedJid = new xmpp.JID(to);
        if (parsedJid.domain === 'conf.hipchat.com') {
          packet = new xmpp.Element("message", {
            to: "" + to,
            type: "groupchat"
          });
        } else {
          packet = new xmpp.Element("message", {
            to: to,
            type: "chat"
          });
          packet.c("inactive", {
            xmlns: "http://jabber/protocol/chatstates"
          });
        }
        packet.c("body").t(message);

        this.client.send(packet);
    }

    this.recieveStanza = function(stanza){
        if (stanza.is('message')) {
            if (!stanza.attrs.type) {
                x = stanza.getChild("x", "http://jabber.org/protocol/muc#user");
                if (!x) {
                  return;
                }
                invite = x.getChild("invite");
                if (!invite) {
                  return;
                }
                inviteRoom = new xmpp.JID(stanza.attrs.from);
                this.joinRoom(inviteRoom);
            } else if(stanza.getChildText('body')) {
                var message = stanza.getChildText('body');
                var regex = new RegExp('^[@]{0,1}' + this.nickname)
                var fromJid = new xmpp.JID(stanza.attrs.from);
                var fromChannel = fromJid.bare().toString();
                var fromName = fromJid.resource;
                var user;
                if (fromName === this.botname) {
                    return;
                }
                message.replace(regex, this.api.name);
                if (message.substring(0, 1) === '@') {
                  message = message.substring(1);
                }

                if (stanza.attrs.type === 'groupchat') {
                    var matches = stanza.attrs.from.match(/^(.+?)@(.+?)\/(.+?)$/);
                    var room = matches[1];
                    var nickName = matches[3];
                    user = this.users[room][nickName];
                } else {
                    user = stanza.attrs.from.split('/')[0];
                }
                this.messageRecieved(stanza.attrs.from, message, user);
            }
        } else if (stanza.is('iq')){
            var eventId = "iq:" + stanza.attrs.id;
            if (stanza.attrs.type === 'result') {
                eventEmitter.emit(eventId, null, stanza);
            }
        }

        if (stanza.is('presence')) {
            var x = stanza.getChild("x", "http://jabber.org/protocol/muc#user")
            if (x) {
                var matches = stanza.attrs.from.match(/^(.+?)@(.+?)\/(.+?)$/);
                var room = matches[1];
                var nickName = matches[3];

                if (!this.users[room]) {
                    this.users[room] = {};
                }

                if (!stanza.attrs.type) {
                    this.users[room][nickName] = x.getChild("item").attrs.jid;
                } else {
                    delete this.users[room][nickName];
                }
            }
        }

        if(stanza.is('presence') && stanza.attrs.type === 'subscribe') {
            stanza.attrs.to = stanza.attrs.from;
            delete stanza.attrs.from;

            this.client.send(stanza);
        }
    }

    this.exit = function(){
        if (this.client) {
            this.client.end();
        }
    }

    return this;
}
