var xmpp = require("node-xmpp");
var client = new xmpp.Client({
    jid: '',
    password: '',
    host: 'chat.hipchat.com'
})

module.exports = function(api){
    var self = this;

    client.connection.socket.setTimeout(0)
    client.connection.socket.setKeepAlive(true, 10000)

    this.keepalive = setInterval(function() {
        client.send(new xmpp.Element('r'));
      }, 10000);
    client.on('online', function() {
        client.send(new xmpp.Element('presence', {})
            .c('show')
            .t('chat')
            .up()
            .c('status')
            .t('Online')
        );
        api.addMessageSender('hipchat', function(message, to){
            self.sendMessage(to, message);
        });
    });

    client.on('stanza', function(stanza) {
        self.recieveStanza(stanza);
    })

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
        return client.send(packet);
    }

    this.sendMessage = function(to, message) {
        var packet, parsedJid;
        parsedJid = new xmpp.JID(to);
        if (parsedJid.domain === 'conf.hipchat.com') {
          packet = new xmpp.Element("message", {
            to: "" + to + "/" + "Woodhouse Bot",
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

        client.send(packet);
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
                if (message.substring(0, 1) == '@') {
                  message = message.substring(1);
                }
                api.messageRecieved(stanza.attrs.from, 'hipchat', message);
            }
        }

        if(stanza.is('presence') && stanza.attrs.type === 'subscribe') {
            stanza.attrs.to = stanza.attrs.from;
            delete stanza.attrs.from;

            client.send(stanza);
        }
    }
}
