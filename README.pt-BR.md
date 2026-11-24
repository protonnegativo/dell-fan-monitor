# Dell Fan Monitor

Uma extensão pequena do GNOME Shell para notebooks Dell. Ela mostra a
temperatura da CPU e o uso de RAM na barra de cima, e o menu deixa mudar a
velocidade da ventoinha e o perfil térmico com um clique.

[English](README.md)

## O que ela faz

- **Barra de cima:** temperatura da CPU e uso de RAM, atualizados a cada 3
  segundos.
- **Menu:** uso de CPU, RAM em GB, temperatura e a rotação de cada ventoinha.
- **Ventoinha:** Automática, Baixa ou Máxima.
- **Perfil térmico:** os perfis que o seu notebook oferece, como Frio,
  Silencioso, Balanceado e Desempenho.

Não depende de nada além do próprio GNOME Shell. Tudo é lido de `/proc` e
`/sys`.

## Requisitos

- GNOME Shell 50. Foi escrita para a API de extensões do GNOME 45+, mas a
  versão 50 é a única em que foi testada.
- Um notebook Dell em que o driver `dell_smm_hwmon` do kernel exponha o
  controle da ventoinha (`pwm1` e `pwm1_enable`). Para conferir:

  ```sh
  grep -l dell_smm /sys/class/hwmon/hwmon*/name
  ```

- Os perfis térmicos precisam de `/sys/firmware/acpi/platform_profile`.
- `polkit` (`pkexec`), que o GNOME já usa.

Foi testada em uma máquina só: um Dell XPS 13 7390 com Ubuntu 26.04. Em outro
hardware, a parte de monitor funciona onde existir `coretemp`, e as seções de
ventoinha e perfil se escondem quando o hardware não tem suporte.

## Instalação

```sh
git clone https://github.com/protonnegativo/dell-fan-monitor.git
cd dell-fan-monitor
make install
sudo make install-helper
```

Depois saia da sessão, entre de novo e ative:

```sh
gnome-extensions enable dell-fan-monitor@protonnegativo.github.io
```

A tradução em português só é gerada se o `gettext` (`msgfmt`) estiver
instalado. Sem ele a extensão é instalada em inglês.

### O que é o ajudante

Mudar a velocidade da ventoinha exige escrever em arquivos que só o root pode
alterar. Por isso `sudo make install-helper` instala duas coisas:

- `/usr/local/sbin/dell-fan-monitor-helper`: um script curto que só aceita
  `fan auto|low|high` e `profile <nome>`, e só escreve nos arquivos de
  ventoinha e de perfil térmico em `/sys`. Leia antes de instalar:
  [helper/dell-fan-monitor-helper](helper/dell-fan-monitor-helper).
- Uma regra do polkit que deixa o usuário local logado rodar esse script sem
  digitar senha. Sessões remotas e inativas continuam pedindo autenticação de
  administrador.

Sem o ajudante a extensão continua funcionando como monitor.

## Segurança

- **Baixa** e **Máxima** passam as ventoinhas para o controle manual, e o
  firmware para de ajustá-las. Se a CPU chegar a 88 °C com a ventoinha em
  Baixa, a extensão devolve o controle ao firmware e mostra uma notificação.
  Essa checagem roda dentro da extensão, então só funciona com você logado e
  a extensão ativa.
- Não existe opção de desligar as ventoinhas.
- O controle da ventoinha volta ao automático a cada reinício.
- Este software não tem garantia. Use o controle manual por sua conta e
  risco.

## Remoção

```sh
make uninstall
sudo make uninstall-helper
```

## Licença

GPL-3.0-or-later. Veja [LICENSE](LICENSE).
