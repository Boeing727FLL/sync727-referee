/** Terms of Use, Privacy Policy and the one-time terms gate, in all 12 app languages. */
export type LegalSection = [string, string];
export type LegalDoc = { title: string; updated: string; intro?: string; note?: string; sections: LegalSection[] };
export type LegalCopy = { terms: LegalDoc; privacy: LegalDoc; gate: { title: string; sub: string; check: string; cta: string; readTerms: string; readPrivacy: string; menu: string } };
export const LEGAL: Record<string, LegalCopy> = {
 "he": {
  "terms": {
   "title": "תנאי שימוש",
   "updated": "עדכון אחרון: ספטמבר 2026",
   "sections": [
    [
     "מה זה",
     "שופט וירטואלי הוא כלי קהילתי חינמי שנבנה על ידי קבוצת Boeing 727 כדי לעזור להבין את חוקי FIRST LEGO League. הוא לא מוצר רשמי של FIRST או של LEGO, ואין לו קשר רשמי אליהם."
    ],
    [
     "התשובות נכתבות על ידי בינה מלאכותית",
     "התשובות נוצרות אוטומטית ועלולות להיות שגויות, חלקיות או לא מעודכנות. הן לא מחליפות את ספר החוקים הרשמי ואת העדכונים הרשמיים של FIRST. לפני החלטה חשובה, תבדקו במקור הרשמי."
    ],
    [
     "השופט הראשי מחליט",
     "בתחרות, הפסיקה של השופט הראשי בזירה היא הסופית. תשובה מהאפליקציה היא לא פסיקה, ואי אפשר להסתמך עליה בערעור או בוויכוח עם שופטים."
    ],
    [
     "בלי אחריות",
     "השירות ניתן כמו שהוא (AS IS), בלי התחייבות לדיוק, לזמינות או להתאמה למטרה מסוימת. במידה המרבית שהחוק מתיר, מפעילי השירות לא אחראים לשום נזק, הפסד נקודות, תוצאה בתחרות או החלטה שהתקבלה בגלל שימוש בשירות."
    ],
    [
     "כללי שימוש",
     "משתמשים בשירות רק לשאלות על חוקי התחרות. לא שולחים תוכן פוגעני, פרטים אישיים של אחרים או תמונות של אנשים בלי רשותם. לא מנסים לעקוף מגבלות שימוש, לפרוץ או להעמיס על השירות. אנחנו יכולים להגביל או לחסום חשבון שמפר את הכללים, ולשנות או להפסיק את השירות בכל זמן."
    ],
    [
     "ילדים ובני נוער",
     "השירות נבנה בשביל קבוצות FLL, ורוב המשתמשים הם תלמידים. מאמנים והורים יכולים לבקש בכל זמן למחוק חשבון, במייל למטה."
    ],
    [
     "פרטיות",
     "המידע שנאסף ואיך משתמשים בו מוסבר במדיניות הפרטיות. השימוש בשירות כפוף גם לה."
    ],
    [
     "שינויים",
     "אנחנו יכולים לעדכן את התנאים. אם יהיה שינוי מהותי, נבקש לאשר מחדש."
    ],
    [
     "יצירת קשר",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "הטקסט נכתב על ידי הקבוצה ולא נבדק על ידי עורך דין."
  },
  "privacy": {
   "title": "מדיניות פרטיות",
   "updated": "עדכון אחרון: ספטמבר 2026",
   "intro": "אנחנו שומרים רק את מה שצריך כדי שהשירות יעבוד.",
   "sections": [
    [
     "מה נשמר",
     "בהרשמה: השם וכתובת האימייל.|אישור תנאי השימוש: התאריך והגרסה שאישרתם.|שאלות ותשובות: נשמרות ביומן כדי לבדוק ולשפר את איכות התשובות. רק מנהל השירות ושופטים ראשיים עם קוד גישה יכולים לראות אותו.|משוב ששלחתם: הדירוג והטקסט.|מונים סטטיסטיים: כמה שאלות נשאלו, בלי תוכן."
    ],
    [
     "למי זה נשלח",
     "כדי לענות, השאלה (וגם תמונה, אם צילמתם) נשלחת לשירות AI של צד שלישי שמייצר את התשובה. תמונות לא נשמרות אצלנו.|החשבון והנתונים מאוחסנים אצל ספק ענן מוכר.|אנחנו לא מוכרים מידע ולא מעבירים אותו לאף אחד אחר."
    ],
    [
     "כמה זמן",
     "שאלות ביומן נשמרות לבדיקת איכות. אפשר לבקש למחוק אותן בכל זמן במייל.|השיחה עצמה לא נשמרת במכשיר. רענון מתחיל שיחה חדשה."
    ],
    [
     "השליטה שלכם",
     "אפשר למחוק את החשבון בכל רגע מתפריט המשתמש. המחיקה מוחקת לצמיתות את החשבון ואת פרטי ההרשמה. שאלות שכבר נשמרו ביומן נמחקות לפי בקשה במייל.|לשאלות או לבקשה למחוק מידע: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "לפני שמתחילים",
   "sub": "כמה דברים חשובים, פעם אחת בלבד.",
   "check": "קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות.",
   "cta": "מסכים/ה וממשיכים",
   "readTerms": "תנאי שימוש",
   "readPrivacy": "מדיניות פרטיות",
   "menu": "תנאי שימוש"
  }
 },
 "en": {
  "terms": {
   "title": "Terms of Use",
   "updated": "Last updated: September 2026",
   "sections": [
    [
     "What this is",
     "Virtual Referee is a free community tool built by team Boeing 727 to help people understand the FIRST LEGO League rules. It is not an official FIRST or LEGO product and has no official connection to them."
    ],
    [
     "Answers are written by AI",
     "Answers are generated automatically and may be wrong, incomplete or out of date. They do not replace the official rulebook or official FIRST updates. Before an important decision, check the official source."
    ],
    [
     "The head referee decides",
     "At a tournament, the head referee's ruling is final. An answer from the app is not a ruling and cannot be relied on in an appeal or an argument with referees."
    ],
    [
     "No warranty",
     "The service is provided AS IS, with no promise of accuracy, availability or fitness for any purpose. To the fullest extent the law allows, the people who run the service are not responsible for any damage, lost points, tournament result or decision made because of using it."
    ],
    [
     "Usage rules",
     "Use the service only for questions about the competition rules. Do not send offensive content, other people's personal details, or photos of people without their permission. Do not try to get around usage limits, hack or overload the service. We may limit or block an account that breaks these rules, and change or stop the service at any time."
    ],
    [
     "Kids and teens",
     "The service was built for FLL teams, and most users are students. Coaches and parents can ask at any time to delete an account, by email below."
    ],
    [
     "Privacy",
     "What we collect and how we use it is explained in the Privacy Policy. Using the service is also subject to it."
    ],
    [
     "Changes",
     "We may update these terms. If there is a major change, we will ask you to accept again."
    ],
    [
     "Contact",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "This text was written by the team and has not been reviewed by a lawyer."
  },
  "privacy": {
   "title": "Privacy Policy",
   "updated": "Last updated: September 2026",
   "intro": "We keep only what the service needs to work.",
   "sections": [
    [
     "What we keep",
     "At sign-up: your name and email address.|Terms acceptance: the date and the version you accepted.|Questions and answers: kept in a journal to check and improve answer quality. Only the service admin and head referees with an access code can see it.|Feedback you send: the rating and text.|Usage counters: how many questions were asked, without content."
    ],
    [
     "Who it goes to",
     "To answer, your question (and a photo, if you took one) is sent to a third-party AI service that generates the answer. Photos are not stored by us.|Your account and data are stored with a well-known cloud provider.|We do not sell data or pass it to anyone else."
    ],
    [
     "How long",
     "Questions in the journal are kept for quality checks. You can ask us to delete them at any time by email.|The conversation itself is not saved on your device. A refresh starts a new chat."
    ],
    [
     "Your control",
     "You can delete your account at any time from the user menu. This permanently deletes the account and your sign-up details. Questions already saved in the journal are deleted on request by email.|For questions or a request to delete data: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Before we start",
   "sub": "A few important things, just once.",
   "check": "I have read and agree to the Terms of Use and the Privacy Policy.",
   "cta": "Agree and continue",
   "readTerms": "Terms of Use",
   "readPrivacy": "Privacy Policy",
   "menu": "Terms of Use"
  }
 },
 "es": {
  "terms": {
   "title": "Condiciones de uso",
   "updated": "Última actualización: septiembre de 2026",
   "sections": [
    [
     "Qué es",
     "Árbitro Virtual es una herramienta comunitaria gratuita creada por el equipo Boeing 727 para ayudar a entender las reglas de FIRST LEGO League. No es un producto oficial de FIRST ni de LEGO y no tiene ninguna relación oficial con ellos."
    ],
    [
     "Las respuestas las escribe una IA",
     "Las respuestas se generan automáticamente y pueden ser incorrectas, incompletas o estar desactualizadas. No sustituyen al reglamento oficial ni a las actualizaciones oficiales de FIRST. Antes de una decisión importante, consulta la fuente oficial."
    ],
    [
     "Decide el árbitro principal",
     "En un torneo, la decisión del árbitro principal es definitiva. Una respuesta de la app no es una decisión y no sirve como base para una apelación o una discusión con los árbitros."
    ],
    [
     "Sin garantía",
     "El servicio se ofrece TAL CUAL, sin promesa de exactitud, disponibilidad o idoneidad para ningún fin. En la máxima medida permitida por la ley, quienes gestionan el servicio no son responsables de ningún daño, pérdida de puntos, resultado de torneo o decisión tomada por usar el servicio."
    ],
    [
     "Normas de uso",
     "Usa el servicio solo para preguntas sobre las reglas de la competición. No envíes contenido ofensivo, datos personales de otras personas ni fotos de personas sin su permiso. No intentes saltarte los límites de uso, hackear ni sobrecargar el servicio. Podemos limitar o bloquear una cuenta que incumpla estas normas, y cambiar o detener el servicio en cualquier momento."
    ],
    [
     "Niños y adolescentes",
     "El servicio se creó para equipos FLL y la mayoría de los usuarios son estudiantes. Entrenadores y padres pueden pedir en cualquier momento que se elimine una cuenta, por correo electrónico (abajo)."
    ],
    [
     "Privacidad",
     "Qué datos recogemos y cómo los usamos se explica en la Política de privacidad. El uso del servicio también está sujeto a ella."
    ],
    [
     "Cambios",
     "Podemos actualizar estas condiciones. Si hay un cambio importante, te pediremos que las aceptes de nuevo."
    ],
    [
     "Contacto",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Este texto lo escribió el equipo y no lo ha revisado un abogado."
  },
  "privacy": {
   "title": "Política de privacidad",
   "updated": "Última actualización: septiembre de 2026",
   "intro": "Solo guardamos lo que el servicio necesita para funcionar.",
   "sections": [
    [
     "Qué guardamos",
     "Al registrarte: tu nombre y tu correo electrónico.|Aceptación de las condiciones: la fecha y la versión que aceptaste.|Preguntas y respuestas: se guardan en un registro para revisar y mejorar la calidad de las respuestas. Solo el administrador del servicio y los árbitros principales con código de acceso pueden verlo.|Opiniones que envías: la puntuación y el texto.|Contadores de uso: cuántas preguntas se hicieron, sin su contenido."
    ],
    [
     "A quién se envía",
     "Para responder, tu pregunta (y una foto, si hiciste una) se envía a un servicio de IA de terceros que genera la respuesta. No guardamos las fotos.|Tu cuenta y tus datos se almacenan en un proveedor de nube conocido.|No vendemos datos ni los pasamos a nadie más."
    ],
    [
     "Cuánto tiempo",
     "Las preguntas del registro se guardan para revisar la calidad. Puedes pedir que se eliminen en cualquier momento por correo.|La conversación no se guarda en tu dispositivo. Al recargar empieza un chat nuevo."
    ],
    [
     "Tu control",
     "Puedes eliminar tu cuenta en cualquier momento desde el menú de usuario. Esto elimina para siempre la cuenta y tus datos de registro. Las preguntas ya guardadas en el registro se eliminan si lo pides por correo.|Para dudas o para pedir que se eliminen datos: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Antes de empezar",
   "sub": "Unas cosas importantes, solo una vez.",
   "check": "He leído y acepto las Condiciones de uso y la Política de privacidad.",
   "cta": "Aceptar y continuar",
   "readTerms": "Condiciones de uso",
   "readPrivacy": "Política de privacidad",
   "menu": "Condiciones de uso"
  }
 },
 "fr": {
  "terms": {
   "title": "Conditions d'utilisation",
   "updated": "Dernière mise à jour : septembre 2026",
   "sections": [
    [
     "De quoi s'agit-il",
     "Arbitre Virtuel est un outil communautaire gratuit créé par l'équipe Boeing 727 pour aider à comprendre les règles de la FIRST LEGO League. Ce n'est pas un produit officiel de FIRST ou de LEGO, et il n'a aucun lien officiel avec eux."
    ],
    [
     "Les réponses sont écrites par une IA",
     "Les réponses sont générées automatiquement et peuvent être fausses, incomplètes ou dépassées. Elles ne remplacent pas le règlement officiel ni les mises à jour officielles de FIRST. Avant une décision importante, vérifiez la source officielle."
    ],
    [
     "L'arbitre principal décide",
     "En tournoi, la décision de l'arbitre principal est définitive. Une réponse de l'application n'est pas une décision et ne peut pas servir lors d'un appel ou d'une discussion avec les arbitres."
    ],
    [
     "Aucune garantie",
     "Le service est fourni TEL QUEL, sans promesse d'exactitude, de disponibilité ou d'adéquation à un usage. Dans toute la mesure permise par la loi, les personnes qui gèrent le service ne sont responsables d'aucun dommage, perte de points, résultat de tournoi ou décision prise à cause de son utilisation."
    ],
    [
     "Règles d'utilisation",
     "Utilisez le service uniquement pour des questions sur les règles de la compétition. N'envoyez pas de contenu offensant, de données personnelles d'autres personnes ni de photos de personnes sans leur accord. N'essayez pas de contourner les limites d'utilisation, de pirater ou de surcharger le service. Nous pouvons limiter ou bloquer un compte qui enfreint ces règles, et modifier ou arrêter le service à tout moment."
    ],
    [
     "Enfants et adolescents",
     "Le service a été créé pour les équipes FLL, et la plupart des utilisateurs sont des élèves. Les entraîneurs et les parents peuvent demander à tout moment la suppression d'un compte, par e-mail (ci-dessous)."
    ],
    [
     "Confidentialité",
     "Les données collectées et leur utilisation sont expliquées dans la Politique de confidentialité. L'utilisation du service y est aussi soumise."
    ],
    [
     "Modifications",
     "Nous pouvons mettre à jour ces conditions. En cas de changement important, nous vous demanderons de les accepter à nouveau."
    ],
    [
     "Contact",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Ce texte a été rédigé par l'équipe et n'a pas été relu par un avocat."
  },
  "privacy": {
   "title": "Politique de confidentialité",
   "updated": "Dernière mise à jour : septembre 2026",
   "intro": "Nous ne gardons que ce dont le service a besoin pour fonctionner.",
   "sections": [
    [
     "Ce que nous gardons",
     "À l'inscription : votre nom et votre adresse e-mail.|Acceptation des conditions : la date et la version acceptées.|Questions et réponses : gardées dans un journal pour vérifier et améliorer la qualité des réponses. Seuls l'administrateur du service et les arbitres principaux munis d'un code d'accès peuvent le voir.|Avis envoyés : la note et le texte.|Compteurs d'utilisation : le nombre de questions posées, sans leur contenu."
    ],
    [
     "À qui c'est envoyé",
     "Pour répondre, votre question (et une photo, si vous en avez pris une) est envoyée à un service d'IA tiers qui génère la réponse. Nous ne gardons pas les photos.|Votre compte et vos données sont hébergés chez un fournisseur cloud reconnu.|Nous ne vendons pas les données et ne les transmettons à personne d'autre."
    ],
    [
     "Combien de temps",
     "Les questions du journal sont gardées pour contrôler la qualité. Vous pouvez demander leur suppression à tout moment par e-mail.|La conversation n'est pas enregistrée sur votre appareil. Un rafraîchissement démarre un nouveau chat."
    ],
    [
     "Vos choix",
     "Vous pouvez supprimer votre compte à tout moment depuis le menu utilisateur. Cela supprime définitivement le compte et vos données d'inscription. Les questions déjà enregistrées dans le journal sont supprimées sur demande par e-mail.|Pour toute question ou demande de suppression : boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Avant de commencer",
   "sub": "Quelques points importants, une seule fois.",
   "check": "J'ai lu et j'accepte les Conditions d'utilisation et la Politique de confidentialité.",
   "cta": "Accepter et continuer",
   "readTerms": "Conditions d'utilisation",
   "readPrivacy": "Politique de confidentialité",
   "menu": "Conditions d'utilisation"
  }
 },
 "de": {
  "terms": {
   "title": "Nutzungsbedingungen",
   "updated": "Zuletzt aktualisiert: September 2026",
   "sections": [
    [
     "Was das ist",
     "Virtueller Schiedsrichter ist ein kostenloses Community-Tool, das Team Boeing 727 gebaut hat, um die Regeln der FIRST LEGO League besser zu verstehen. Es ist kein offizielles Produkt von FIRST oder LEGO und hat keine offizielle Verbindung zu ihnen."
    ],
    [
     "Antworten schreibt eine KI",
     "Die Antworten werden automatisch erstellt und können falsch, unvollständig oder veraltet sein. Sie ersetzen nicht das offizielle Regelwerk und die offiziellen Updates von FIRST. Prüft vor einer wichtigen Entscheidung die offizielle Quelle."
    ],
    [
     "Der Hauptschiedsrichter entscheidet",
     "Im Wettbewerb ist die Entscheidung des Hauptschiedsrichters endgültig. Eine Antwort der App ist keine Entscheidung und kann nicht bei einem Einspruch oder einer Diskussion mit Schiedsrichtern verwendet werden."
    ],
    [
     "Keine Gewährleistung",
     "Der Dienst wird WIE BESEHEN angeboten, ohne Zusage von Richtigkeit, Verfügbarkeit oder Eignung für einen bestimmten Zweck. Soweit gesetzlich zulässig, haften die Betreiber nicht für Schäden, verlorene Punkte, Wettbewerbsergebnisse oder Entscheidungen, die durch die Nutzung entstehen."
    ],
    [
     "Nutzungsregeln",
     "Nutzt den Dienst nur für Fragen zu den Wettbewerbsregeln. Sendet keine beleidigenden Inhalte, keine persönlichen Daten anderer und keine Fotos von Personen ohne deren Erlaubnis. Versucht nicht, Nutzungsgrenzen zu umgehen, den Dienst zu hacken oder zu überlasten. Wir können Konten, die gegen diese Regeln verstoßen, einschränken oder sperren und den Dienst jederzeit ändern oder einstellen."
    ],
    [
     "Kinder und Jugendliche",
     "Der Dienst wurde für FLL-Teams gebaut, und die meisten Nutzer sind Schülerinnen und Schüler. Coaches und Eltern können jederzeit per E-Mail (unten) die Löschung eines Kontos verlangen."
    ],
    [
     "Datenschutz",
     "Welche Daten wir erheben und wie wir sie nutzen, steht in der Datenschutzerklärung. Die Nutzung des Dienstes unterliegt auch ihr."
    ],
    [
     "Änderungen",
     "Wir können diese Bedingungen aktualisieren. Bei einer wesentlichen Änderung bitten wir euch, sie erneut zu akzeptieren."
    ],
    [
     "Kontakt",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Dieser Text wurde vom Team geschrieben und nicht von einem Anwalt geprüft."
  },
  "privacy": {
   "title": "Datenschutzerklärung",
   "updated": "Zuletzt aktualisiert: September 2026",
   "intro": "Wir speichern nur, was der Dienst zum Funktionieren braucht.",
   "sections": [
    [
     "Was wir speichern",
     "Bei der Anmeldung: Name und E-Mail-Adresse.|Zustimmung zu den Bedingungen: Datum und akzeptierte Version.|Fragen und Antworten: werden in einem Protokoll gespeichert, um die Qualität der Antworten zu prüfen und zu verbessern. Nur der Administrator und Hauptschiedsrichter mit Zugangscode können es sehen.|Gesendetes Feedback: Bewertung und Text.|Nutzungszähler: wie viele Fragen gestellt wurden, ohne Inhalt."
    ],
    [
     "Wohin es geht",
     "Für die Antwort wird eure Frage (und ein Foto, falls aufgenommen) an einen KI-Dienst eines Drittanbieters gesendet, der die Antwort erstellt. Fotos speichern wir nicht.|Konto und Daten liegen bei einem bekannten Cloud-Anbieter.|Wir verkaufen keine Daten und geben sie an niemanden sonst weiter."
    ],
    [
     "Wie lange",
     "Fragen im Protokoll werden zur Qualitätsprüfung aufbewahrt. Ihr könnt jederzeit per E-Mail ihre Löschung verlangen.|Das Gespräch selbst wird nicht auf dem Gerät gespeichert. Neu laden startet einen neuen Chat."
    ],
    [
     "Eure Kontrolle",
     "Ihr könnt euer Konto jederzeit im Benutzermenü löschen. Das löscht das Konto und die Anmeldedaten dauerhaft. Bereits im Protokoll gespeicherte Fragen werden auf Anfrage per E-Mail gelöscht.|Für Fragen oder Löschanfragen: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Bevor es losgeht",
   "sub": "Ein paar wichtige Punkte, nur einmal.",
   "check": "Ich habe die Nutzungsbedingungen und die Datenschutzerklärung gelesen und stimme zu.",
   "cta": "Zustimmen und weiter",
   "readTerms": "Nutzungsbedingungen",
   "readPrivacy": "Datenschutzerklärung",
   "menu": "Nutzungsbedingungen"
  }
 },
 "pt": {
  "terms": {
   "title": "Termos de uso",
   "updated": "Última atualização: setembro de 2026",
   "sections": [
    [
     "O que é",
     "O Árbitro Virtual é uma ferramenta comunitária gratuita criada pela equipe Boeing 727 para ajudar a entender as regras da FIRST LEGO League. Não é um produto oficial da FIRST nem da LEGO e não tem ligação oficial com elas."
    ],
    [
     "As respostas são escritas por IA",
     "As respostas são geradas automaticamente e podem estar erradas, incompletas ou desatualizadas. Elas não substituem o livro de regras oficial nem as atualizações oficiais da FIRST. Antes de uma decisão importante, confira a fonte oficial."
    ],
    [
     "O árbitro principal decide",
     "No torneio, a decisão do árbitro principal é final. Uma resposta do app não é uma decisão e não pode ser usada em um recurso ou discussão com os árbitros."
    ],
    [
     "Sem garantia",
     "O serviço é oferecido NO ESTADO EM QUE SE ENCONTRA, sem promessa de precisão, disponibilidade ou adequação a qualquer finalidade. Na máxima extensão permitida por lei, quem opera o serviço não é responsável por nenhum dano, perda de pontos, resultado de torneio ou decisão tomada por causa do uso do serviço."
    ],
    [
     "Regras de uso",
     "Use o serviço apenas para perguntas sobre as regras da competição. Não envie conteúdo ofensivo, dados pessoais de outras pessoas ou fotos de pessoas sem permissão. Não tente burlar limites de uso, invadir ou sobrecarregar o serviço. Podemos limitar ou bloquear uma conta que viole estas regras e mudar ou encerrar o serviço a qualquer momento."
    ],
    [
     "Crianças e adolescentes",
     "O serviço foi criado para equipes FLL, e a maioria dos usuários são estudantes. Técnicos e pais podem pedir a qualquer momento a exclusão de uma conta, por e-mail (abaixo)."
    ],
    [
     "Privacidade",
     "O que coletamos e como usamos está explicado na Política de privacidade. O uso do serviço também está sujeito a ela."
    ],
    [
     "Mudanças",
     "Podemos atualizar estes termos. Se houver uma mudança importante, pediremos que você aceite novamente."
    ],
    [
     "Contato",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Este texto foi escrito pela equipe e não foi revisado por um advogado."
  },
  "privacy": {
   "title": "Política de privacidade",
   "updated": "Última atualização: setembro de 2026",
   "intro": "Guardamos apenas o que o serviço precisa para funcionar.",
   "sections": [
    [
     "O que guardamos",
     "No cadastro: seu nome e e-mail.|Aceite dos termos: a data e a versão aceita.|Perguntas e respostas: guardadas em um registro para verificar e melhorar a qualidade das respostas. Só o administrador do serviço e árbitros principais com código de acesso podem vê-lo.|Feedback enviado: a nota e o texto.|Contadores de uso: quantas perguntas foram feitas, sem o conteúdo."
    ],
    [
     "Para quem vai",
     "Para responder, sua pergunta (e uma foto, se você tirou) é enviada a um serviço de IA de terceiros que gera a resposta. Não guardamos as fotos.|Sua conta e seus dados ficam em um provedor de nuvem conhecido.|Não vendemos dados nem os repassamos a mais ninguém."
    ],
    [
     "Por quanto tempo",
     "As perguntas do registro são guardadas para controle de qualidade. Você pode pedir a exclusão a qualquer momento por e-mail.|A conversa não fica salva no seu aparelho. Recarregar começa um chat novo."
    ],
    [
     "Seu controle",
     "Você pode excluir sua conta a qualquer momento pelo menu do usuário. Isso apaga para sempre a conta e seus dados de cadastro. Perguntas já salvas no registro são apagadas a pedido, por e-mail.|Dúvidas ou pedidos de exclusão: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Antes de começar",
   "sub": "Algumas coisas importantes, só uma vez.",
   "check": "Li e concordo com os Termos de uso e a Política de privacidade.",
   "cta": "Concordar e continuar",
   "readTerms": "Termos de uso",
   "readPrivacy": "Política de privacidade",
   "menu": "Termos de uso"
  }
 },
 "it": {
  "terms": {
   "title": "Termini di utilizzo",
   "updated": "Ultimo aggiornamento: settembre 2026",
   "sections": [
    [
     "Che cos'è",
     "Arbitro Virtuale è uno strumento gratuito della community creato dal team Boeing 727 per aiutare a capire le regole della FIRST LEGO League. Non è un prodotto ufficiale di FIRST o LEGO e non ha alcun legame ufficiale con loro."
    ],
    [
     "Le risposte sono scritte da un'IA",
     "Le risposte sono generate automaticamente e possono essere sbagliate, incomplete o non aggiornate. Non sostituiscono il regolamento ufficiale né gli aggiornamenti ufficiali di FIRST. Prima di una decisione importante, controllate la fonte ufficiale."
    ],
    [
     "Decide l'arbitro capo",
     "In gara, la decisione dell'arbitro capo è definitiva. Una risposta dell'app non è una decisione e non può essere usata in un ricorso o in una discussione con gli arbitri."
    ],
    [
     "Nessuna garanzia",
     "Il servizio è fornito COSÌ COM'È, senza promesse di accuratezza, disponibilità o idoneità a uno scopo. Nella misura massima consentita dalla legge, chi gestisce il servizio non è responsabile di danni, punti persi, risultati di gara o decisioni prese a causa del suo utilizzo."
    ],
    [
     "Regole d'uso",
     "Usate il servizio solo per domande sulle regole della competizione. Non inviate contenuti offensivi, dati personali di altri o foto di persone senza il loro permesso. Non cercate di aggirare i limiti di utilizzo, di violare o sovraccaricare il servizio. Possiamo limitare o bloccare un account che viola queste regole e modificare o interrompere il servizio in qualsiasi momento."
    ],
    [
     "Bambini e ragazzi",
     "Il servizio è nato per le squadre FLL e la maggior parte degli utenti sono studenti. Allenatori e genitori possono chiedere in qualsiasi momento la cancellazione di un account, via email (sotto)."
    ],
    [
     "Privacy",
     "Quali dati raccogliamo e come li usiamo è spiegato nell'Informativa sulla privacy. L'uso del servizio è soggetto anche a essa."
    ],
    [
     "Modifiche",
     "Possiamo aggiornare questi termini. In caso di modifica importante, vi chiederemo di accettarli di nuovo."
    ],
    [
     "Contatti",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Questo testo è stato scritto dal team e non è stato verificato da un avvocato."
  },
  "privacy": {
   "title": "Informativa sulla privacy",
   "updated": "Ultimo aggiornamento: settembre 2026",
   "intro": "Conserviamo solo ciò che serve al servizio per funzionare.",
   "sections": [
    [
     "Cosa conserviamo",
     "All'iscrizione: nome e indirizzo email.|Accettazione dei termini: la data e la versione accettata.|Domande e risposte: conservate in un registro per controllare e migliorare la qualità delle risposte. Solo l'amministratore del servizio e gli arbitri capo con codice di accesso possono vederlo.|Feedback inviato: il voto e il testo.|Contatori d'uso: quante domande sono state fatte, senza il contenuto."
    ],
    [
     "A chi viene inviato",
     "Per rispondere, la domanda (e una foto, se l'avete scattata) viene inviata a un servizio di IA di terze parti che genera la risposta. Non conserviamo le foto.|Account e dati sono ospitati da un noto fornitore cloud.|Non vendiamo dati e non li passiamo a nessun altro."
    ],
    [
     "Per quanto tempo",
     "Le domande nel registro sono conservate per il controllo qualità. Potete chiederne la cancellazione in qualsiasi momento via email.|La conversazione non viene salvata sul dispositivo. Ricaricando inizia una nuova chat."
    ],
    [
     "Il vostro controllo",
     "Potete eliminare l'account in qualsiasi momento dal menu utente. L'operazione elimina per sempre l'account e i dati di iscrizione. Le domande già salvate nel registro vengono cancellate su richiesta via email.|Per domande o richieste di cancellazione: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Prima di iniziare",
   "sub": "Alcune cose importanti, una volta sola.",
   "check": "Ho letto e accetto i Termini di utilizzo e l'Informativa sulla privacy.",
   "cta": "Accetto e continuo",
   "readTerms": "Termini di utilizzo",
   "readPrivacy": "Informativa sulla privacy",
   "menu": "Termini di utilizzo"
  }
 },
 "ru": {
  "terms": {
   "title": "Условия использования",
   "updated": "Последнее обновление: сентябрь 2026",
   "sections": [
    [
     "Что это",
     "Виртуальный судья — бесплатный инструмент сообщества, созданный командой Boeing 727, чтобы помочь разобраться в правилах FIRST LEGO League. Это не официальный продукт FIRST или LEGO, и он официально с ними не связан."
    ],
    [
     "Ответы пишет ИИ",
     "Ответы создаются автоматически и могут быть неверными, неполными или устаревшими. Они не заменяют официальный свод правил и официальные обновления FIRST. Перед важным решением проверьте официальный источник."
    ],
    [
     "Решает главный судья",
     "На соревновании решение главного судьи окончательно. Ответ приложения — не решение, и на него нельзя ссылаться при апелляции или споре с судьями."
    ],
    [
     "Без гарантий",
     "Сервис предоставляется «КАК ЕСТЬ», без обещаний точности, доступности или пригодности для какой-либо цели. В максимальной степени, разрешённой законом, создатели сервиса не несут ответственности за любой ущерб, потерю очков, результат соревнования или решение, принятое из-за использования сервиса."
    ],
    [
     "Правила использования",
     "Используйте сервис только для вопросов о правилах соревнования. Не отправляйте оскорбительный контент, личные данные других людей или фото людей без их разрешения. Не пытайтесь обходить ограничения, взламывать или перегружать сервис. Мы можем ограничить или заблокировать аккаунт, нарушающий правила, и изменить или остановить сервис в любое время."
    ],
    [
     "Дети и подростки",
     "Сервис создан для команд FLL, и большинство пользователей — школьники. Тренеры и родители могут в любое время попросить удалить аккаунт по электронной почте (ниже)."
    ],
    [
     "Конфиденциальность",
     "Какие данные мы собираем и как их используем, описано в Политике конфиденциальности. Использование сервиса также регулируется ею."
    ],
    [
     "Изменения",
     "Мы можем обновлять эти условия. При существенном изменении мы попросим принять их снова."
    ],
    [
     "Контакты",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "Этот текст написан командой и не проверялся юристом."
  },
  "privacy": {
   "title": "Политика конфиденциальности",
   "updated": "Последнее обновление: сентябрь 2026",
   "intro": "Мы храним только то, что нужно для работы сервиса.",
   "sections": [
    [
     "Что мы храним",
     "При регистрации: имя и адрес электронной почты.|Принятие условий: дата и принятая версия.|Вопросы и ответы: хранятся в журнале, чтобы проверять и улучшать качество ответов. Видеть его могут только администратор сервиса и главные судьи с кодом доступа.|Отправленные отзывы: оценка и текст.|Счётчики использования: сколько вопросов задано, без содержания."
    ],
    [
     "Куда это передаётся",
     "Чтобы ответить, ваш вопрос (и фото, если вы его сделали) отправляется стороннему ИИ-сервису, который создаёт ответ. Фото мы не храним.|Аккаунт и данные хранятся у известного облачного провайдера.|Мы не продаём данные и никому их не передаём."
    ],
    [
     "Как долго",
     "Вопросы в журнале хранятся для проверки качества. Вы можете в любое время попросить их удалить по электронной почте.|Сам разговор не сохраняется на устройстве. Обновление страницы начинает новый чат."
    ],
    [
     "Ваш контроль",
     "Вы можете удалить аккаунт в любое время в меню пользователя. Это навсегда удаляет аккаунт и регистрационные данные. Вопросы, уже сохранённые в журнале, удаляются по запросу на почту.|Вопросы и запросы на удаление: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "Перед началом",
   "sub": "Несколько важных вещей, всего один раз.",
   "check": "Я прочитал(а) и принимаю Условия использования и Политику конфиденциальности.",
   "cta": "Принять и продолжить",
   "readTerms": "Условия использования",
   "readPrivacy": "Политика конфиденциальности",
   "menu": "Условия использования"
  }
 },
 "ar": {
  "terms": {
   "title": "شروط الاستخدام",
   "updated": "آخر تحديث: سبتمبر 2026",
   "sections": [
    [
     "ما هذا",
     "الحكم الافتراضي أداة مجتمعية مجانية أنشأها فريق Boeing 727 للمساعدة في فهم قواعد FIRST LEGO League. ليست منتجًا رسميًا من FIRST أو LEGO، ولا تربطها بهما أي علاقة رسمية."
    ],
    [
     "الإجابات يكتبها الذكاء الاصطناعي",
     "تُنشأ الإجابات تلقائيًا وقد تكون خاطئة أو ناقصة أو قديمة. لا تغني عن كتاب القواعد الرسمي والتحديثات الرسمية من FIRST. قبل أي قرار مهم، راجعوا المصدر الرسمي."
    ],
    [
     "الحكم الرئيسي هو من يقرر",
     "في المسابقة، قرار الحكم الرئيسي نهائي. إجابة التطبيق ليست قرارًا تحكيميًا، ولا يمكن الاعتماد عليها في اعتراض أو نقاش مع الحكام."
    ],
    [
     "دون ضمان",
     "تُقدَّم الخدمة كما هي، دون أي التزام بالدقة أو التوفر أو الملاءمة لغرض معين. وإلى أقصى حد يسمح به القانون، لا يتحمل القائمون على الخدمة مسؤولية أي ضرر أو خسارة نقاط أو نتيجة في المسابقة أو قرار اتُّخذ بسبب استخدامها."
    ],
    [
     "قواعد الاستخدام",
     "استخدموا الخدمة فقط للأسئلة عن قواعد المسابقة. لا ترسلوا محتوى مسيئًا أو بيانات شخصية لآخرين أو صورًا لأشخاص دون إذنهم. لا تحاولوا تجاوز حدود الاستخدام أو اختراق الخدمة أو إثقالها. يمكننا تقييد أو حظر أي حساب يخالف هذه القواعد، وتغيير الخدمة أو إيقافها في أي وقت."
    ],
    [
     "الأطفال والمراهقون",
     "أُنشئت الخدمة لفرق FLL، ومعظم المستخدمين طلاب. يمكن للمدربين والأهل طلب حذف أي حساب في أي وقت عبر البريد الإلكتروني أدناه."
    ],
    [
     "الخصوصية",
     "ما نجمعه وكيف نستخدمه موضح في سياسة الخصوصية، ويخضع استخدام الخدمة لها أيضًا."
    ],
    [
     "التغييرات",
     "قد نحدّث هذه الشروط. وإذا حدث تغيير جوهري، سنطلب منكم الموافقة مجددًا."
    ],
    [
     "التواصل",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "كتب الفريق هذا النص ولم يراجعه محامٍ."
  },
  "privacy": {
   "title": "سياسة الخصوصية",
   "updated": "آخر تحديث: سبتمبر 2026",
   "intro": "نحتفظ فقط بما تحتاجه الخدمة لتعمل.",
   "sections": [
    [
     "ما نحتفظ به",
     "عند التسجيل: الاسم والبريد الإلكتروني.|الموافقة على الشروط: التاريخ والنسخة التي وافقتم عليها.|الأسئلة والإجابات: تُحفظ في سجل لفحص جودة الإجابات وتحسينها. لا يراه إلا مدير الخدمة والحكام الرئيسيون الذين لديهم رمز دخول.|الملاحظات التي ترسلونها: التقييم والنص.|عدادات الاستخدام: عدد الأسئلة دون محتواها."
    ],
    [
     "إلى من تُرسل",
     "للإجابة، يُرسل سؤالكم (وصورة إن التقطتم واحدة) إلى خدمة ذكاء اصطناعي تابعة لطرف ثالث تُنشئ الإجابة. لا نحتفظ بالصور.|يُخزَّن حسابكم وبياناتكم لدى مزوّد سحابي معروف.|لا نبيع البيانات ولا نعطيها لأي جهة أخرى."
    ],
    [
     "المدة",
     "تُحفظ الأسئلة في السجل لفحص الجودة، ويمكنكم طلب حذفها في أي وقت عبر البريد.|المحادثة نفسها لا تُحفظ على الجهاز. التحديث يبدأ محادثة جديدة."
    ],
    [
     "تحكمكم",
     "يمكنكم حذف الحساب في أي وقت من قائمة المستخدم. يحذف ذلك الحساب وبيانات التسجيل نهائيًا. أما الأسئلة المحفوظة في السجل فتُحذف عند الطلب عبر البريد.|للأسئلة أو طلبات الحذف: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "قبل أن نبدأ",
   "sub": "بعض الأمور المهمة، مرة واحدة فقط.",
   "check": "قرأت شروط الاستخدام وسياسة الخصوصية وأوافق عليهما.",
   "cta": "أوافق وأتابع",
   "readTerms": "شروط الاستخدام",
   "readPrivacy": "سياسة الخصوصية",
   "menu": "شروط الاستخدام"
  }
 },
 "zh": {
  "terms": {
   "title": "使用条款",
   "updated": "最后更新：2026年9月",
   "sections": [
    [
     "这是什么",
     "虚拟裁判是由 Boeing 727 队开发的免费社区工具，帮助大家理解 FIRST LEGO League 的规则。它不是 FIRST 或 LEGO 的官方产品，与它们没有任何官方关系。"
    ],
    [
     "回答由 AI 生成",
     "回答是自动生成的，可能有错误、不完整或已过时。它们不能代替官方规则手册和 FIRST 的官方更新。做重要决定前，请查看官方来源。"
    ],
    [
     "主裁判说了算",
     "比赛中，主裁判的裁决是最终决定。应用的回答不是裁决，不能在申诉或与裁判争论时作为依据。"
    ],
    [
     "不提供保证",
     "本服务按“现状”提供，不保证准确、可用或适合任何用途。在法律允许的最大范围内，服务运营者不对因使用本服务造成的任何损失、失分、比赛结果或所做决定负责。"
    ],
    [
     "使用规则",
     "只用本服务询问比赛规则相关的问题。不要发送冒犯性内容、他人的个人信息，或未经同意的他人照片。不要试图绕过使用限制、入侵或让服务过载。对违反规则的账号，我们可以限制或封禁，也可以随时更改或停止服务。"
    ],
    [
     "儿童和青少年",
     "本服务是为 FLL 队伍打造的，大多数用户是学生。教练和家长可以随时通过下方邮箱要求删除账号。"
    ],
    [
     "隐私",
     "我们收集哪些信息以及如何使用，请见隐私政策。使用本服务也受其约束。"
    ],
    [
     "变更",
     "我们可能更新这些条款。如有重大变更，会请你重新同意。"
    ],
    [
     "联系我们",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "本文由团队撰写，未经律师审核。"
  },
  "privacy": {
   "title": "隐私政策",
   "updated": "最后更新：2026年9月",
   "intro": "我们只保存服务运行所必需的信息。",
   "sections": [
    [
     "我们保存什么",
     "注册时：姓名和邮箱。|同意条款：同意的日期和版本。|问题和回答：保存在日志中，用于检查和提升回答质量。只有服务管理员和持有访问码的主裁判能查看。|你发送的反馈：评分和文字。|使用计数：提问数量，不含内容。"
    ],
    [
     "会发送给谁",
     "为了回答，你的问题（以及你拍的照片）会发送给生成回答的第三方 AI 服务。我们不保存照片。|账号和数据存储在知名的云服务商。|我们不出售数据，也不提供给任何其他人。"
    ],
    [
     "保存多久",
     "日志中的问题用于质量检查。你可以随时发邮件要求删除。|对话本身不会保存在设备上，刷新后会开始新的对话。"
    ],
    [
     "你的控制权",
     "你可以随时在用户菜单中删除账号，这会永久删除账号和注册信息。已保存在日志中的问题可通过邮件申请删除。|问题或删除请求：boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "开始之前",
   "sub": "几件重要的事，只需一次。",
   "check": "我已阅读并同意使用条款和隐私政策。",
   "cta": "同意并继续",
   "readTerms": "使用条款",
   "readPrivacy": "隐私政策",
   "menu": "使用条款"
  }
 },
 "ja": {
  "terms": {
   "title": "利用規約",
   "updated": "最終更新：2026年9月",
   "sections": [
    [
     "これは何か",
     "バーチャル審判は、FIRST LEGO League のルールを理解する手助けとして Boeing 727 チームが作った無料のコミュニティツールです。FIRST や LEGO の公式製品ではなく、公式な関係もありません。"
    ],
    [
     "回答は AI が書いています",
     "回答は自動で作られ、間違っていたり、不完全だったり、古かったりすることがあります。公式ルールブックや FIRST の公式アップデートの代わりにはなりません。大事な判断の前には公式の情報を確認してください。"
    ],
    [
     "決めるのは主審",
     "大会では主審の判定が最終です。アプリの回答は判定ではなく、異議申し立てや審判との議論の根拠にはなりません。"
    ],
    [
     "保証なし",
     "本サービスは「現状のまま」提供され、正確さ、利用可能性、特定目的への適合性は保証されません。法律で認められる最大限の範囲で、運営者は本サービスの利用による損害、失点、大会結果、判断について責任を負いません。"
    ],
    [
     "利用ルール",
     "大会ルールに関する質問にだけ使ってください。不快な内容、他人の個人情報、本人の許可のない人物写真を送らないでください。利用制限の回避、不正アクセス、過負荷をかける行為は禁止です。ルールに違反したアカウントは制限・停止することがあり、サービスはいつでも変更・終了することがあります。"
    ],
    [
     "子どもと十代の方へ",
     "本サービスは FLL チームのために作られ、利用者の多くは学生です。コーチや保護者は、下記メールでいつでもアカウントの削除を依頼できます。"
    ],
    [
     "プライバシー",
     "収集する情報とその使い方はプライバシーポリシーに書かれています。本サービスの利用はこれにも従います。"
    ],
    [
     "変更",
     "この規約は更新されることがあります。大きな変更がある場合は、改めて同意をお願いします。"
    ],
    [
     "お問い合わせ",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "この文章はチームが書いたもので、弁護士の確認は受けていません。"
  },
  "privacy": {
   "title": "プライバシーポリシー",
   "updated": "最終更新：2026年9月",
   "intro": "サービスの動作に必要なものだけを保存します。",
   "sections": [
    [
     "保存するもの",
     "登録時：名前とメールアドレス。|規約への同意：同意した日付とバージョン。|質問と回答：回答の品質確認と改善のために記録に保存します。見られるのはサービス管理者とアクセスコードを持つ主審だけです。|送信したフィードバック：評価と文章。|利用カウント：質問の数（内容は含みません）。"
    ],
    [
     "送信先",
     "回答のため、質問（撮影した場合は写真も）は回答を作る第三者の AI サービスに送られます。写真は保存しません。|アカウントとデータは有名なクラウド事業者に保存されます。|データを販売したり、他の誰かに渡したりすることはありません。"
    ],
    [
     "保存期間",
     "記録の質問は品質確認のために保存されます。メールでいつでも削除を依頼できます。|会話そのものは端末に保存されません。再読み込みすると新しいチャットになります。"
    ],
    [
     "あなたの選択",
     "ユーザーメニューからいつでもアカウントを削除できます。アカウントと登録情報は完全に削除されます。すでに記録に保存された質問は、メールで依頼すれば削除します。|お問い合わせ・削除依頼：boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "はじめる前に",
   "sub": "大切なことを、最初の一回だけ。",
   "check": "利用規約とプライバシーポリシーを読み、同意します。",
   "cta": "同意して続ける",
   "readTerms": "利用規約",
   "readPrivacy": "プライバシーポリシー",
   "menu": "利用規約"
  }
 },
 "ko": {
  "terms": {
   "title": "이용 약관",
   "updated": "최종 업데이트: 2026년 9월",
   "sections": [
    [
     "이 서비스는",
     "가상 심판은 FIRST LEGO League 규칙을 이해하도록 돕기 위해 Boeing 727 팀이 만든 무료 커뮤니티 도구입니다. FIRST나 LEGO의 공식 제품이 아니며, 이들과 공식적인 관계가 없습니다."
    ],
    [
     "답변은 AI가 작성합니다",
     "답변은 자동으로 생성되며 틀리거나, 불완전하거나, 오래된 내용일 수 있습니다. 공식 규칙서와 FIRST의 공식 업데이트를 대신하지 않습니다. 중요한 결정 전에는 공식 자료를 확인하세요."
    ],
    [
     "최종 판정은 주심이",
     "대회에서는 주심의 판정이 최종입니다. 앱의 답변은 판정이 아니며, 이의 제기나 심판과의 논쟁에서 근거로 삼을 수 없습니다."
    ],
    [
     "보증 없음",
     "서비스는 있는 그대로 제공되며, 정확성, 이용 가능성, 특정 목적 적합성을 보장하지 않습니다. 법이 허용하는 최대 범위에서, 운영자는 서비스 이용으로 인한 손해, 감점, 대회 결과 또는 결정에 대해 책임지지 않습니다."
    ],
    [
     "이용 규칙",
     "대회 규칙에 관한 질문에만 사용하세요. 불쾌한 내용, 다른 사람의 개인정보, 허락 없이 찍은 사람 사진을 보내지 마세요. 이용 제한을 우회하거나, 해킹하거나, 서비스에 과부하를 주지 마세요. 규칙을 어긴 계정은 제한하거나 차단할 수 있으며, 서비스는 언제든 변경하거나 중단할 수 있습니다."
    ],
    [
     "어린이와 청소년",
     "이 서비스는 FLL 팀을 위해 만들어졌고, 대부분의 사용자는 학생입니다. 코치와 부모님은 언제든 아래 이메일로 계정 삭제를 요청할 수 있습니다."
    ],
    [
     "개인정보",
     "어떤 정보를 수집하고 어떻게 쓰는지는 개인정보 처리방침에 설명되어 있습니다. 서비스 이용은 이 방침에도 따릅니다."
    ],
    [
     "변경",
     "약관은 업데이트될 수 있습니다. 중요한 변경이 있으면 다시 동의를 요청합니다."
    ],
    [
     "문의",
     "boeing727.il@gmail.com"
    ]
   ],
   "note": "이 글은 팀이 작성했으며 변호사의 검토를 받지 않았습니다."
  },
  "privacy": {
   "title": "개인정보 처리방침",
   "updated": "최종 업데이트: 2026년 9월",
   "intro": "서비스 운영에 꼭 필요한 정보만 보관합니다.",
   "sections": [
    [
     "보관하는 정보",
     "가입 시: 이름과 이메일 주소.|약관 동의: 동의한 날짜와 버전.|질문과 답변: 답변 품질을 확인하고 개선하기 위해 기록에 보관합니다. 서비스 관리자와 접근 코드를 가진 주심만 볼 수 있습니다.|보낸 피드백: 평점과 내용.|이용 통계: 질문 수(내용 제외)."
    ],
    [
     "전송 대상",
     "답변을 위해 질문(사진을 찍었다면 사진도)은 답변을 생성하는 제3자 AI 서비스로 전송됩니다. 사진은 저장하지 않습니다.|계정과 데이터는 잘 알려진 클라우드 업체에 저장됩니다.|데이터를 판매하거나 다른 누구에게도 넘기지 않습니다."
    ],
    [
     "보관 기간",
     "기록의 질문은 품질 확인을 위해 보관됩니다. 언제든 이메일로 삭제를 요청할 수 있습니다.|대화 자체는 기기에 저장되지 않습니다. 새로고침하면 새 대화가 시작됩니다."
    ],
    [
     "사용자의 권리",
     "사용자 메뉴에서 언제든 계정을 삭제할 수 있습니다. 계정과 가입 정보가 영구 삭제됩니다. 이미 기록에 저장된 질문은 이메일 요청 시 삭제합니다.|문의 및 삭제 요청: boeing727.il@gmail.com"
    ]
   ]
  },
  "gate": {
   "title": "시작하기 전에",
   "sub": "중요한 내용, 처음 한 번만.",
   "check": "이용 약관과 개인정보 처리방침을 읽었으며 동의합니다.",
   "cta": "동의하고 계속",
   "readTerms": "이용 약관",
   "readPrivacy": "개인정보 처리방침",
   "menu": "이용 약관"
  }
 }
};
export const legalFor = (lang: string): LegalCopy => LEGAL[lang] || LEGAL.he;
