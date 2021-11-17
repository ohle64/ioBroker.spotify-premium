/*global systemDictionary:true */
'use strict';

systemDictionary = {
    "Authorization": {                               "en": "Authorization",                                   "de": "Autorisierung",                                   "ru": "Авторизация",                                     "pt": "Autorização",                                     "nl": "autorisatie",                                     "fr": "Autorisation",                                    "it": "Autorizzazione",                                  "es": "Autorización",                                    "pl": "Upoważnienie",                                    "zh-cn": "授权"},
    "Common settings": {                             "en": "Common settings",                                 "de": "Allgemeine Einstellungen",                        "ru": "Общие настройки",                                 "pt": "Configurações padrão",                            "nl": "Veelvoorkomende instellingen",                    "fr": "Paramètres communs",                              "it": "Impostazioni comuni",                             "es": "Configuraciones comunes",                         "pl": "Wspólne ustawienia",                              "zh-cn": "常用设置"},
    "Get Authorization": {                           "en": "Get Authorization",                               "de": "Autorisierung einholen",                          "ru": "Получить авторизацию",                            "pt": "Obtenha autorização",                             "nl": "Autorisatie verkrijgen",                          "fr": "Obtenir l'autorisation",                          "it": "Ottieni l'autorizzazione",                        "es": "Obtener autorización",                            "pl": "Uzyskaj autoryzację",                             "zh-cn": "获得授权"},
    "Message": {                                     "en": "Message",                                         "de": "Botschaft",                                       "ru": "Сообщение",                                       "pt": "Mensagem",                                        "nl": "Bericht",                                         "fr": "Un message",                                      "it": "Messaggio",                                       "es": "Mensaje",                                         "pl": "Wiadomość",                                       "zh-cn": "信息"},
    "Send": {                                        "en": "Send",                                            "de": "Senden",                                          "ru": "послать",                                         "pt": "Mandar",                                          "nl": "Sturen",                                          "fr": "Envoyer",                                         "it": "Spedire",                                         "es": "Enviar",                                          "pl": "Wysłać",                                          "zh-cn": "发送"},
    "clientId": {                                    "en": "Client ID",                                       "de": "Client ID",                                       "ru": "Client ID",                                       "pt": "Client ID",                                       "nl": "Client ID",                                       "fr": "Client ID",                                       "it": "Client ID",                                       "es": "Client ID",                                       "pl": "Client ID",                                       "zh-cn": "客户编号"},
    "clientSecret": {                                "en": "Client Secret",                                   "de": "Client Secret",                                   "ru": "Client Secret",                                   "pt": "Client Secret",                                   "nl": "Client Secret",                                   "fr": "Client Secret",                                   "it": "Client Secret",                                   "es": "Client Secret",                                   "pl": "Client Secret",                                   "zh-cn": "客户机密"},
    "defaultShuffle": {                              "en": "Default shuffle state",                           "de": "Standard-\"Shuffle\"-status",                     "ru": "Состояние перемешивания по умолчанию",            "pt": "Estado aleatório padrão",                         "nl": "Standaard shuffle-status",                        "fr": "État de lecture aléatoire par défaut",            "it": "Stato di riproduzione casuale predefinito",       "es": "Estado aleatorio predeterminado",                 "pl": "Domyślny stan odtwarzania losowego",              "zh-cn": "默认随机状态"},
    "deleteDevices": {                               "en": "Delete devices that no longer exist",             "de": "Nicht mehr vorhandene Geräte löschen",            "ru": "Удалить устройства, которые больше не существуют", "pt": "Eliminar dispositivos que não existam mais",      "nl": "Verwijder apparaten die niet meer bestaan",       "fr": "Supprimer les appareils qui n'existent plus",     "it": "Elimina i dispositivi che non esistono più",      "es": "Eliminar dispositivos que ya no existen",         "pl": "Usuń urządzenia, które już nie istnieją",         "zh-cn": "删除不再存在的设备"},
    "deletePlaylists": {                             "en": "Delete no longer existing playlists",             "de": "Nicht mehr vorhandene Playlisten löschen",        "ru": "Удалить уже существующие плейлисты",              "pt": "Eliminar já não existem listas de reprodução existentes", "nl": "Verwijder niet langer bestaande afspeellijsten",  "fr": "Supprimer les listes de lecture existantes",      "it": "Elimina playlist non più esistenti",              "es": "Eliminar listas de reproducción ya no existentes", "pl": "Usuń nieistniejące już playlisty",                "zh-cn": "删除不再存在的播放列表"},
    "deviceInterval": {                              "en": "Refresh interval for device information. (in minutes, recommended 5, 0 = disabled)", "de": "Aktualisierungsintervall für Geräteinformationen. (in Minuten; empfohlen 5; 0 = deaktiviert)", "ru": "Интервал обновления информации об устройстве. (в минутах, рекомендуется 5, 0 = отключено)", "pt": "Intervalo de atualização para informações do dispositivo. (em minutos, recomendado 5, 0 = desativado)", "nl": "Vernieuw interval voor apparaatinformatie. (in minuten, aanbevolen 5, 0 = uitgeschakeld)", "fr": "Intervalle d'actualisation pour les informations sur le périphérique. (en minutes, recommandé 5, 0 = désactivé)", "it": "Aggiorna intervallo per le informazioni sul dispositivo. (in minuti, consigliato 5, 0 = disabilitato)", "es": "Intervalo de actualización para la información del dispositivo. (en minutos, recomendado 5, 0 = deshabilitado)", "pl": "Interwał odświeżania informacji o urządzeniu. (w minutach, zalecane 5, 0 = wyłączone)", "zh-cn": "设备信息的刷新间隔。 （以分钟为单位，推荐 5，0 = 禁用）"},
    "keepShuffleState": {                            "en": "On some devices the shuffle will always disabled if a playlist is started. With this option a workaround is used to avoid this behavior.", "de": "Bei einigen Geräten wird Shuffle immer deaktiviert, wenn eine neue Playliste gestartet wird. Mit diese Option wird versucht dieses Verhalten zu umgehen.", "ru": "На некоторых устройствах тасовка всегда будет отключена, если будет запущен плейлист. С помощью этой опции используется обходной путь, чтобы избежать такого поведения.", "pt": "Em alguns dispositivos, o shuffle sempre será desativado se uma lista de reprodução for iniciada. Com essa opção, uma solução alternativa é usada para evitar esse comportamento.", "nl": "Op sommige apparaten wordt de shuffle altijd uitgeschakeld als een afspeellijst wordt gestart. Met deze optie wordt een tijdelijke oplossing gebruikt om dit gedrag te voorkomen.", "fr": "Sur certains appareils, la lecture aléatoire est toujours désactivée si une liste de lecture est lancée. Avec cette option, une solution de contournement est utilisée pour éviter ce comportement.", "it": "Su alcuni dispositivi lo shuffle sarà sempre disabilitato se viene avviata una playlist. Con questa opzione viene utilizzata una soluzione alternativa per evitare questo comportamento.", "es": "En algunos dispositivos, la reproducción aleatoria siempre se desactivará si se inicia una lista de reproducción. Con esta opción, se utiliza una solución alternativa para evitar este comportamiento.", "pl": "W przypadku niektórych urządzeń odtwarzanie losowe będzie zawsze wyłączone po uruchomieniu playlisty. Ta opcja umożliwia obejście tego zachowania.", "zh-cn": "在某些设备上，如果播放列表启动，随机播放将始终被禁用。使用此选项可以使用一种变通方法来避免此行为。"},
    "manual0": {                                     "en": "Authorization",                                   "de": "Authorization",                                   "ru": "авторизация",                                     "pt": "Autorização",                                     "nl": "Machtiging",                                      "fr": "Autorisation",                                    "it": "Autorizzazione",                                  "es": "Autorización",                                    "pl": "Upoważnienie",                                    "zh-cn": "授权"},
    "manual1": {                                     "en": "Sign in on https://developer.spotify.com/dashboard/", "de": "Registriere dich unter https://developer.spotify.com/dashboard/", "ru": "Зарегистрируйтесь также https://developer.spotify.com/dashboard/", "pt": "Assine também https://developer.spotify.com/dashboard/", "nl": "Meld u ook aan op https://developer.spotify.com/dashboard/", "fr": "Inscrivez-vous aussi https://developer.spotify.com/dashboard/", "it": "Iscriviti anche a https://developer.spotify.com/dashboard/", "es": "Regístrese también https://developer.spotify.com/dashboard/", "pl": "Zaloguj się na https://developer.spotify.com/dashboard/", "zh-cn": "登录 https://developer.spotify.com/dashboard/"},
    "manual10": {                                    "en": "Copy that url and put it to 'spotify-premium.X.authorization.authorizationReturnUri'", "de": "Kopiere diese URL und füge sie im Tab Objekte unter dem State 'spotify-premium.X.authorization.authorizationReturnUri' ein", "ru": "Теперь скопируйте этот URL-адрес и вставьте его в состояние 'spotify-premium.X.authorization.authorizationReturnUri'", "pt": "Copie este URL novamente e cole-o no estado 'spotify-premium.X.authorization.authorizationReturnUri'", "nl": "Kopieer deze URL opnieuw en plak deze in de status 'spotify-premium.X.authorization.authorizationReturnUri'", "fr": "Copiez à nouveau cette URL et collez-la dans l'état 'spotify-premium.X.authorization.authorizationReturnUri'", "it": "Copia di nuovo l'URL e incollalo nello stato \"spotify-premium.X.authorization.authorizationReturnUri\"", "es": "Copie esta URL nuevamente y péguelo en el estado 'spotify-premium.X.authorization.authorizationReturnUri'", "pl": "skopiuj ten adres URL i umieść go w 'spotify-premium.X.authorization.authorizationReturnUri'", "zh-cn": "复制该 url 并将其放入 'spotify-premium.X.authorization.authorizationReturnUri'"},
    "manual11": {                                    "en": "The value in 'spotify-premium.X.authorization.authorized' turns to true if everything was successful", "de": "Es ist alles korrekt eingerichtet wenn in 'spotify-premium.X.authorization.authorized' true erscheint", "ru": "все правильно настроено, если true в 'spotify-premium.X.authorization.authorized'", "pt": "tudo está configurado corretamente se verdadeiro em 'spotify-premium.X.authorization.authorized'", "nl": "alles is correct ingesteld als het waar is in 'spotify-premium.X.authorization.authorized'", "fr": "tout est correctement configuré si vrai dans 'spotify-premium.X.authorization.authorized'", "it": "tutto è impostato correttamente se true in \"spotify-premium.X.authorization.authorized\"", "es": "todo está configurado correctamente si es verdadero en 'spotify-premium.X.authorization.authorized'", "pl": "wartość 'spotify-premium.X.authorization.authorized' zmienia się na true, jeśli wszystko przebiegło pomyślnie", "zh-cn": "如果一切顺利，'spotify-premium.X.authorization.authorized' 中的值变为 true"},
    "manual12": {                                    "en": "Video Tutorial",                                  "de": "Videoanleitung",                                  "ru": "Видеоурок",                                       "pt": "Vídeo tutorial",                                  "nl": "Video-instructies",                               "fr": "Didacticiel vidéo",                               "it": "Tutorial video",                                  "es": "Video Tutorial",                                  "pl": "Instrukcja wideo",                                "zh-cn": "视频教程"},
    "manual2": {                                     "en": "Create an application, you get a Client ID and a Client Secret", "de": "Erstelle eine Application, du erhältst eine Client ID und eine Client Secret", "ru": "Создайте приложение, получите Client ID и Client Secret", "pt": "Crie um aplicativo, obtenha um Client ID e um Client Secret", "nl": "Maak een applicatie, krijg een Client ID en een Client Secret", "fr": "Créer une application, obtenir un Client ID et un Client Secret", "it": "Crea un'applicazione, ottieni un Client ID e un Client Secret", "es": "Crea una aplicación, obtén un Client ID y un Client Secret", "pl": "Utwórz aplikację, otrzymasz identyfikator klienta i klucz klienta", "zh-cn": "创建一个应用程序，您将获得一个客户端 ID 和一个客户端密钥"},
    "manual3": {                                     "en": "Set the redirect URIs to 'http://localhost' in your app settings at your created spotify application", "de": "Trage in den App Settings deiner Application bei Redirect URIs 'http://localhost' ein", "ru": "в настройках приложения вашего приложения введите 'http://localhost' в Redirect URIs", "pt": "nas configurações do aplicativo do seu aplicativo, digite 'http://localhost' no Redirect URIs", "nl": "Voer in de app-instellingen van uw toepassing 'http://localhost' in bij Redirect URIs", "fr": "Dans les paramètres de l'application de votre application, entrez 'http://localhost' sur Redirect URIs", "it": "nelle impostazioni dell'app dell'applicazione, immettere \"http://localhost\" su Redirect URIs", "es": "en la configuración de la aplicación, ingrese 'http://localhost' en Redirect URIs", "pl": "ustaw przekierowania URI na http://localhost w ustawieniach aplikacji w utworzonej aplikacji spotify", "zh-cn": "在您创建的 Spotify 应用程序的应用程序设置中将重定向 URI 设置为“http://localhost”"},
    "manual4": {                                     "en": "Put the Client ID and Client Secret in the fields down below", "de": "Trage hier deine Client ID und Client Secret ein", "ru": "введите свои Cliend ID и Client Secret здесь",    "pt": "insira seu Cliend ID e Client Secret aqui",       "nl": "vul hier je Cliend ID en Client Secret in",       "fr": "entrez votre Cliend ID et Client Secret ici",     "it": "inserisci il tuo Cliend ID e Client Secret qui",  "es": "ingrese su Cliend ID y Client Secret aquí",       "pl": "umieść Cliend ID i Secret klienta w polach poniżej", "zh-cn": "在下方的字段中输入客户端 ID 和客户端密码"},
    "manual5": {                                     "en": "Save the changes",                                "de": "Speichere die Änderungen",                        "ru": "Сохрани изменения",                               "pt": "Comece a instância",                              "nl": "Start het exemplaar",                             "fr": "Démarrer l'instance",                             "it": "Avvia l'istanza",                                 "es": "Comience la instancia",                           "pl": "uruchom instancję",                               "zh-cn": "保存更改"},
    "manual6": {                                     "en": "Switch to objects tab and push the button getAuthorization at 'spotify-premium.X.authorization'", "de": "Wechsle zum Tab Objekte und klicke unter 'spotify-premium.X.authorization' auf den Button 'getAuthorization'", "ru": "перейдите на вкладку Объекты и нажмите кнопку getAuthorization в разделе 'spotify-premium.X.authorization'", "pt": "mude para a guia Objetos e clique no botão getAuthorization em 'spotify-premium.X.authorization'", "nl": "schakel naar het tabblad Objecten en klik op 'getAuthorization' onder 'spotify-premium.X.authorization'", "fr": "passer à l'onglet Objets et cliquer sur 'getAuthorization' sous 'spotify-premium.X.authorization'", "it": "passare alla scheda Oggetti e fare clic su \"getAuthorization\" in \"spotify-premium.X.authorization\"", "es": "cambie a la pestaña Objetos y haga clic en getAuthorization en 'spotify-premium.X.authorization'", "pl": "przejdź do zakładki obiektów i naciśnij przycisk getAuthorization na 'spotify-premium.X.authorization'", "zh-cn": "切换到对象选项卡并在“spotify-premium.X.authorization”处按下按钮 getAuthorization"},
    "manual6.5": {                                   "en": "Go to \"Authorization\" tab",                     "de": "Gehen Sie zum Tab \"Autorisierung\"",             "ru": "Перейдите на вкладку «Авторизация»",              "pt": "Vá para a guia \"Autorização\"",                  "nl": "Ga naar het tabblad \"Autorisatie\"",             "fr": "Allez dans l'onglet \"Autorisation\"",            "it": "Vai alla scheda \"Autorizzazione\"",              "es": "Vaya a la pestaña \"Autorización\"",              "pl": "Przejdź do zakładki „Autoryzacja”",               "zh-cn": "转到“授权”选项卡"},
    "manual7": {                                     "en": "Copy the appearing URL from 'spotify-premium.X.authorization.authorizationUrl' to your webbrowser and call it", "de": "Kopiere die unter 'spotify-premium.X.authorization.authorizationUrl' angezeigte URL in einen Webbrowser und rufe sie auf.", "ru": "Скопируйте URL-адрес, отображаемый в разделе 'spotify-premium.X.authorization.authorizationUrl' в веб-браузер и перейдите к нему.", "pt": "Copie o URL exibido em 'spotify-premium.X.authorization.authorizationUrl' para um navegador da Web e vá até ele.", "nl": "Kopieer de URL die wordt weergegeven onder 'spotify-premium.X.authorization.authorizationUrl' naar een webbrowser en ga daarheen.", "fr": "Copiez l'URL affichée sous 'spotify-premium.X.authorization.authorizationUrl' dans un navigateur Web et accédez-y.", "it": "Copia l'URL visualizzato sotto \"spotify-premium.X.authorization.authorizationUrl\" su un browser web e vai ad esso.", "es": "Copie la URL que se muestra en 'spotify-premium.X.authorization.authorizationUrl' en un navegador web y acceda a ella.", "pl": "skopiuj wyświetlony adres URL z 'spotify-premium.X.authorization.authorizationUrl' do swojej przeglądarki i nazwij go", "zh-cn": "将出现的 URL 从 'spotify-premium.X.authorization.authorizationUrl' 复制到您的网络浏览器并调用它"},
    "manual8": {                                     "en": "You maybe need to sign in to spotify and grant access", "de": "Du musst dich nun ggf. bei Spotify einloggen und den Zugriff erlauben.", "ru": "Вам может потребоваться войти в Spotify и разрешить доступ.", "pt": "Talvez seja necessário fazer login no Spotify e permitir o acesso.", "nl": "U moet mogelijk inloggen op Spotify en toegang toestaan.", "fr": "Vous devrez peut-être vous connecter à Spotify et autoriser l'accès.", "it": "Potrebbe essere necessario accedere a Spotify e consentire l'accesso.", "es": "Es posible que deba iniciar sesión en Spotify y permitir el acceso.", "pl": "Być może musisz się zalogować, aby spotify i zezwolić na dostęp", "zh-cn": "您可能需要登录才能发现并授予访问权限"},
    "manual9": {                                     "en": "The browser will redirected to an invalid URL. If the error 'invalid redirect uri' occurs please verify step 3", "de": "Der Browser wird die Verbindung ablehnen und in der Adresszeile eine URL zurückgeben. Sollte der Fehler 'invalid redirect uri' erscheinen stelle sicher das Schritt 3 durchgeführt wurde.", "ru": "Браузер отклонит соединение и вернет URL-адрес в адресной строке. Если появляется ошибка «invalid redirect uri», убедитесь, что был выполнен шаг 3.", "pt": "O navegador rejeitará a conexão e retornará um URL na barra de endereços. Se o erro 'invalid redirect uri' aparecer, verifique se o passo 3 foi executado.", "nl": "De browser weigert de verbinding en retourneert een URL in de adresbalk. Als de fout 'invalid redirect uri' wordt weergegeven, controleert u of stap 3 is uitgevoerd.", "fr": "Le navigateur rejettera la connexion et retournera une URL dans la barre d'adresse. Si l'erreur 'invalid redirect uri' apparaît, assurez-vous que l'étape 3 a bien été effectuée.", "it": "Il browser rifiuterà la connessione e restituirà un URL nella barra degli indirizzi. Se viene visualizzato l'errore \"invalid redirect uri\", assicurarsi che il passaggio 3 sia stato eseguito.", "es": "El navegador rechazará la conexión y devolverá una URL en la barra de direcciones. Si aparece el error 'invalid redirect uri', asegúrese de que se haya realizado el paso 3.", "pl": "przeglądarka przekieruje do nieprawidłowego adresu URL. Jeśli wystąpi błąd 'invalid redirect uri', sprawdź krok 3", "zh-cn": "浏览器将重定向到无效的 URL。如果出现“无效重定向 uri”错误，请验证步骤 3"},
    "message": {                                     "en": "Now the new window will be opened. Please enter password and login and authorize the application.<br/>After the page is redirected to \"http://localhost\" with the error - \"page not found\".<br/>Copy this URL into the input field below and press \"Send\" button", "de": "Nun wird das neue Fenster geöffnet. Bitte geben Sie Ihr Passwort ein und loggen Sie sich ein und autorisieren Sie die Anwendung.<br/> Nachdem die Seite mit dem Fehler \"http://localhost\" umgeleitet wurde - \"Seite nicht gefunden\".<br/> Kopiere diese URL in das Eingabefeld unten und drücke auf \"Senden\"", "ru": "Откроется новое окно. Пожалуйста, введите пароль и логин и авторизуйте приложение.<br/> После перенаправления страницы на «http:// localhost» с ошибкой - «страница не найдена».<br/> Скопируйте этот URL в поле ввода ниже и нажмите кнопку «Отправить».", "pt": "Agora a nova janela será aberta. Por favor, insira a senha e login e autorize o aplicativo.<br/> Depois que a página for redirecionada para \"http:// localhost\" com o erro - \"página não encontrada\".<br/> Copie este URL no campo de entrada abaixo e pressione o botão \"Envia\"", "nl": "Nu wordt het nieuwe venster geopend. Voer het wachtwoord in en log in en autoriseer de applicatie.<br/> Nadat de pagina is omgeleid naar \"http://localhost\" met de fout - \"pagina niet gevonden\".<br/> Kopieer deze URL in het invoerveld hieronder en druk op de knop \"Verzenden\"", "fr": "Maintenant, la nouvelle fenêtre s'ouvrira. Veuillez entrer le mot de passe et vous connecter et autoriser l'application.<br/> Une fois la page redirigée vers \"http://localhost\" avec l'erreur - \"page not found\".<br/> Copiez cette URL dans le champ de saisie ci-dessous et appuyez sur le bouton \"Envoyer\"", "it": "Ora si aprirà la nuova finestra. Inserisci la password e accedi e autorizza l'applicazione.<br/> Dopo che la pagina è stata reindirizzata a \"http://localhost\" con l'errore \"pagina non trovata\".<br/> Copia questo URL nel campo di input sottostante e premi il pulsante \"Invia\"", "es": "Ahora se abrirá la nueva ventana. Introduzca la contraseña, inicie sesión y autorice la aplicación.<br/> Después de que la página sea redirigida a \"http://localhost\" con el error \"página no encontrada\".<br/> Copie esta URL en el campo de entrada a continuación y presione el botón \"Enviar\"", "pl": "Teraz otworzy się nowe okno. Wprowadź hasło i login oraz autoryzuj aplikację.<br/> Po przekierowaniu strony na „http://localhost” z błędem „nie znaleziono strony”.<br/> Skopiuj ten adres URL do pola wejściowego poniżej i naciśnij przycisk „Wyślij”", "zh-cn": "现在将打开新窗口。请输入密码并登录并授权应用程序。<br/>页面重定向到“http://localhost”并出现错误后 - “页面未找到”。<br/>将此 URL 复制到下面的输入字段中，然后按“发送”按钮"},
    "off": {                                         "en": "off",                                             "de": "aus",                                             "ru": "выкл",                                            "pt": "desligado",                                       "nl": "uit",                                             "fr": "désactivé",                                       "it": "spento",                                          "es": "apagado",                                         "pl": "wyłączony",                                       "zh-cn": "离开"},
    "on": {                                          "en": "on",                                              "de": "an",                                              "ru": "вкл",                                             "pt": "sobre",                                           "nl": "Aan",                                             "fr": "au",                                              "it": "Su",                                              "es": "sobre",                                           "pl": "na",                                              "zh-cn": "在"},
    "on save adapter restarts with new config immediately": {"en": "on save adapter restarts with new config immediately", "de": "Beim Speichern von Einstellungen der Adapter wird sofort neu gestartet.", "ru": "При сохранении настроек адаптера он сразу же перезапускается", "pt": "no adaptador de salvar reinicia com nova configuração imediatamente", "nl": "on save-adapter wordt onmiddellijk opnieuw opgestart met nieuwe config", "fr": "sur l'adaptateur de sauvegarde redémarre avec la nouvelle config immédiatement", "it": "su save adapter si riavvia immediatamente con la nuova configurazione", "es": "en el adaptador de guardar se reinicia con nueva configuración de inmediato", "pl": "na karcie save natychmiast uruchamia się z nową konfiguracją", "zh-cn": "保存适配器立即使用新配置重新启动"},
    "playlistInterval": {                            "en": "Refresh interval for playlist information. (in minutes, recommended 15, 0 = disabled)", "de": "Aktualisierungsintervall für Playlisteninformationen. (in Minuten; empfohlen 15; 0 = deaktiviert)", "ru": "Интервал обновления для информации о плейлисте. (в минутах, рекомендуется 15, 0 = отключено)", "pt": "Intervalo de atualização para informações de playlist. (em minutos, recomendado 15, 0 = desativado)", "nl": "Vernieuw interval voor afspeellijstinformatie. (in minuten, aanbevolen 15, 0 = uitgeschakeld)", "fr": "Intervalle d'actualisation pour les informations de playlist. (en minutes, recommandé 15, 0 = désactivé)", "it": "Intervallo di aggiornamento per informazioni sulla playlist. (in minuti, consigliato 15, 0 = disabilitato)", "es": "Intervalo de actualización para la información de la lista de reproducción. (en minutos, recomendado 15, 0 = deshabilitado)", "pl": "Interwał odświeżania informacji o liście odtwarzania. (w minutach, zalecane 15, 0 = wyłączone)", "zh-cn": "播放列表信息的刷新间隔。 （以分钟为单位，推荐 15，0 = 禁用）"},
    "sendLabel": {                                   "en": "Copy here the link from other window. Starts with \"http://localhost/?code=...\" and press \"Send\"", "de": "Kopieren Sie hier den Link aus dem anderen Fenster. Beginnt mit \"http://localhost/?code=...\" und drücke auf \"Senden\"", "ru": "Скопируйте сюда ссылку из другого окна. Начинается с http:// localhost /? Code = ... и нажимается \"Отправить\".", "pt": "Copie aqui o link de outra janela. Começa com \"http:// localhost /? Code = ...\" e pressione \"Enviar\"", "nl": "Kopieer hier de link uit een ander venster. Begint met \"http://localhost/?code=...\" en druk op \"Verzenden\"", "fr": "Copiez ici le lien d'une autre fenêtre. Commence par \"http://localhost/?code=...\" et appuyez sur \"Envoyer\"", "it": "Copia qui il link da un'altra finestra. Inizia con \"http://localhost/?code=...\" e premi \"Invia\"", "es": "Copie aquí el enlace de la otra ventana. Comienza con \"http:// localhost /? Code = ...\" y presiona \"Enviar\"", "pl": "Skopiuj tutaj link z innego okna. Zaczyna się od „http://localhost/?code=...” i naciśnij „Wyślij”", "zh-cn": "将其他窗口的链接复制到此处。以“http://localhost/?code=...”开头，然后按“发送”"},
    "statusInterval": {                              "en": "Refresh interval for status information. (in seconds, recommended 10, 0 = disabled). Only required if you control Spotify on devices apart from the adapter.", "de": "Aktualisierungsintervall für Statusinformationen. (in Sekunden; empfohlen 10; 0 = deaktiviert). Nur erforderlich, wenn Sie Spotify auf anderen Geräten als dem Adapter steuern.", "ru": "Интервал обновления для информации о состоянии. (в секундах, рекомендуется 10, 0 = отключено). Требуется только если вы управляете Spotify на устройствах, кроме адаптера.", "pt": "Intervalo de atualização para informações de status. (em segundos, recomendado 10, 0 = desativado). Necessário somente se você controlar o Spotify em dispositivos além do adaptador.", "nl": "Vernieuw interval voor statusinformatie. (in seconden, aanbevolen 10, 0 = uitgeschakeld). Alleen vereist als u Spotify op apparaten anders dan de adapter beheert.", "fr": "Intervalle d'actualisation pour les informations d'état. (en secondes, recommandé 10, 0 = désactivé). Requis uniquement si vous contrôlez Spotify sur des appareils autres que l'adaptateur.", "it": "Intervallo di aggiornamento per informazioni sullo stato. (in secondi, consigliato 10, 0 = disabilitato). Richiesto solo se controlli Spotify su dispositivi diversi dall'adattatore.", "es": "Intervalo de actualización para información de estado. (en segundos, recomendado 10, 0 = deshabilitado). Solo es necesario si controla Spotify en dispositivos aparte del adaptador.", "pl": "Interwał odświeżania dla informacji o stanie. (w sekundach zalecany 10, 0 = wyłączony). Wymagany tylko wtedy, gdy kontrolujesz Spotify na urządzeniach z wyjątkiem adaptera.", "zh-cn": "状态信息的刷新间隔。 （以秒为单位，建议为 10，0 = 禁用）。仅当您在除适配器之外的设备上控制 Spotify 时才需要。"},
};