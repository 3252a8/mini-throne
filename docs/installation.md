# Установка alpha

## Windows

Запустите `artifacts/Mini-Throne-Setup-0.1.0-alpha.1-x64.exe`. EXE пока без
сертификата Authenticode. Он устанавливается для текущего пользователя и регистрирует
`mini-throne`. Данные: `%APPDATA%\Mini Throne`; обычный Throne не изменяется.

Введите HTTPS-origin своего Minishop без пути и токенов, войдите через браузер,
сравните код и подтвердите подключение. На инстансе должен работать плагин.

## Плагин

1. Проверьте Core revision: `67357d3cfad4a430bfd66fbb507ddad390e5eb73`.
   Для другой версии соберите и проверьте новый пакет; проверку совместимости не обходите.
2. В менеджере плагинов импортируйте
   `mini-throne-plugin-0.1.0-alpha.1-linux-x86_64-py3.12.zip`.
3. Издатель: `minishop-3252a8-dev`. Отпечаток:
   `0938230804a2b1438e905361e805c378e8b817c1fe018231e87ee96d8f9ca729`.
   Это ключ тестового плагина, не сертификат подписи Windows EXE.
4. Установите и включите пакет. Нужны Redis, корректный HTTPS `PUBLIC_APP_URL`
   и доступ Core к панели. Блок появится в инструкции, управление сессиями — в устройствах.

Плагин не меняет схему Core и не требует PRO. Очистка Redis завершает его сессии;
повторный вход через браузер остаётся доступен.

## Персональные установочные пакеты

Разместите EXE на сервере в отдельном read-only каталоге и подключите его к backend.
Пример фрагмента собственной Compose-конфигурации:

```yaml
services:
  backend:
    volumes:
      - ./client-artifacts:/opt/mini-throne:ro
    environment:
      MINI_THRONE_INSTALLER_PATH: /opt/mini-throne/Mini-Throne-Setup-0.1.0-alpha.1-x64.exe
      MINI_THRONE_INSTALLER_SHA256: "<SHA-256 из artifacts/SHA256SUMS.txt>"
```

Используйте реальное имя сервиса вашего Compose. После изменения окружения
пересоздайте backend штатным способом. Работающий сервер в этой задаче не изменялся.
Плагин проверяет digest EXE, выдаёт ZIP авторизованному владельцу запроса и удаляет
временный архив после выдачи. Одновременно упаковывается не более двух архивов.
Пользователь должен распаковать ZIP целиком: запуск EXE прямо из просмотрщика
архива не гарантирует доступ к соседнему файлу билета.

## Воспроизводимая сборка

```powershell
cd desktop
npm ci
node scripts/prepare-runtime.mjs
./scripts/build-icon.ps1
npm run check
npm run package
cd ..
python scripts/build-minishop-plugin.py --core ../core
```

Нужны Windows x64, Node 24, Python с `cryptography`, .NET Framework C# compiler.
Ключ плагина хранится в `%LOCALAPPDATA%\Minishop\signing\mini-throne-dev.dpapi`
под Windows DPAPI текущего пользователя; в репозиторий и артефакты не попадает.

## Канал обновлений перед массовой выдачей

Настройте Authenticode и `win.publisherName`, HTTPS generic `publish` provider,
`app-update.yml`, metadata и blockmap. В `desktop/electron/update-config.json`
укажите тот же адрес и издателя. Сервер должен поддерживать Range. Для alpha
нужен соответствующий канал metadata, а не указатель на приватный GitHub с PAT.
Необходим отдельный полный прогон между двумя подписанными версиями.
