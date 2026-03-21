security add-generic-password \
  -a github-app \
  -s github-app-private-key \
  -l "Daax GitHub App Private Key" \
  -D "Daax GitHub App PEM" \
  -w "$(cat falcon-app-sync.pem)" \
  -U
