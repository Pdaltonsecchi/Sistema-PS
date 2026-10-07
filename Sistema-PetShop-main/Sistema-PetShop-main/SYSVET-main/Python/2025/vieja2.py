#Unidad 3

'''Diseña un programa que lea un número entero por teclado y muestre por pantalla los siguientes mensajes:

"El número es negativo", sólo si el número es menor que cero.
"El número es positivo" sólo si el número es mayor que cero.
"El número es cero" sólo si el número es cero.
Los mensajes deben ser exactamente los que se solicitan entre las comillas dobles en la consigna, eso incluye los acentos y símbolos.'''

'''numero=input('Ingrese un numero entero: ')

if int(numero) < 0:
    print('El número es negativo')
elif int(numero) > 0:
    print('El número es positivo')
else:
    print('El número es cero')'''
    

'''Diseña un programa que pida el ingreso de la edad de dos personas y diga quién es más joven, la primera o la segunda. Ten en cuenta que ambas pueden tener la misma edad. 
El programa debe mostrar alguna de las siguientes opciones:

La primera es la más joven
La segunda es la más joven
Ambas tienen la misma edad
Los mensajes deben ser exactamente los que se solicitan, eso incluye los acentos y símbolos.'''

'''persona1=input('Ingrese su edad: ')
persona2=input('Ingrese su edad: ')

if int(persona1) < int(persona2):
    print('La primera es la más joven')
elif int(persona1) > int(persona2):
    print('La segunda es la más joven')
else:
    print('Ambas tienen la misma edad')'''

'''Diseña un programa que, al recibir una cadena de caracteres del usuario representando una fecha en el formato dd/mm/aaaa, determine si el año indicado es bisiesto o no. 
Si el año es bisiesto, el programa mostrará en pantalla el mensaje "Sí es bisiesto"; en caso contrario, mostrará "No es bisiesto".

Recuerda que un año es bisientso si:

Es divisible por 4
No es divisible por 100, salvo que sea divisible por 400.
El programa debe visualizar alguna de las siguientes opciones:

No es bisiesto
Sí es bisiesto
Los mensajes deben ser exactamente los que se solicitan, eso incluye los acentos y símbolos.'''

'''fecha=input('Ingrese una fecha: ')
anio=fecha[ 6: : ]

if int(anio) % 4 == 0:
    print('Sí es bisiesto')
else:
    print('No es bisiesto')''' 


'''Diseña un programa que, dado un número entero, determine si este es el doble de un número impar. Si el número introducido no es entero, debe mostrar el siguiente mensaje de error
"Error: No ingresó un número entero." y el programa se debe terminar.

El ingreso siempre será un número, int o float, pero siempre un número'''

'''numero=input('Ingrese un numero: ')

if (float(numero) % 1) != 0:
    print('Error: No ingresó un número entero.')
else:
    n=int(numero) // 2
    if ((float(numero) // 2 ) % 2 )!= 0:
        print(numero, ' es el doble de ', n, 'que es impar')  
    elif (float(numero) % 2) != 0:
        print(numero, 'no es el doble de un número entero')
    elif ((float(numero) // 2 ) % 2) == 0:
        print(numero, ' es el doble de ', n, 'que no es impar')'''        


'''Realiza un programa para realizar operaciones sencillas en una cuenta bancaria, de acuerdo a las siguientes especificaciones:

Inicializar la cuenta con un saldo de $1000

Mostrar el siguiente menú de opciones:

Bienvenido a Banco Simple!
1. Consultar Saldo
2. Depositar Dinero
3. Extraer Dinero
4. Salir
Solicitar al usuario que elija una opción ingresando el número correspondiente (de 1 a 4)

Realizar la funcionalidad correspondiente a la opción seleccionada:'''

'''cuenta=1000
print('Bienvenido a Banco Simple!
      1. Consultar Saldo
      2. Depositar Dinero
      3. Extraer Dinero
      4. Salir')

numero=input('Ingrese el numero correspondiente: ')

if int(numero) == 1:
    print('Su saldo actual es: $', cuenta)

elif int(numero) == 2:
    deposito=input('Ingrese el monto a depositar: ')
    cuenta=float(cuenta) + float(deposito)
    print('Ha depositado $', deposito, '. Su saldo actual es: $', cuenta)

elif int(numero) == 3:
    extraer=input('Ingrese el monto a extraer: ')
    if float(extraer) <= float(cuenta):
        cuenta=float(cuenta) - float(extraer)
        print('Ha retirado $', extraer, '. Su saldo actual es: $', cuenta)
    else:
        print('Saldo insuficiente! Solamente tiene $', cuenta,'en su cuenta.')

elif int(numero) == 4:
    print ('Gracias por usar Banco Simple!')
    
else:
    print('Ingreso inválido! Las opciones válidas son 1, 2, 3 o 4.')'''
    

'''Pedir al usuario que entre tres números y calcular el máximo y mínimo entre ellos.'''

'''n1=input('Ingrese el primer número: ')
n2=input('Ingrese el segundo número: ')
n3=input('Ingrese el tercer número: ')

#maximo
if float(n1) >= float(n2) and float(n1) >= float (n3):
    máximo=n1
elif float(n2) >= float(n1) and float(n2) >= float (n3):
    máximo=n2
else:
    máximo=n3

#minimo
if float(n1) <= float(n2) and float(n1) <= float (n3):
    mínimo=n1
elif float(n2) <= float(n1) and float(n2) <= float (n3):
    mínimo=n2
else:
    mínimo=n3

print('El máximo es:', máximo)
print('El mínimo es:', mínimo)'''

#Desafio 1

#Nivel 2 – Pensamiento lógico
#🧠Ahora sí, a pensar…
#Deja el piloto automático. Aquí comienza el reto real.

'''🪞4. Detector de palíndromos
Verifica si una frase se lee igual al revés.
Ignora espacios y diferencias entre mayúsculas y minúsculas.
Ejemplo: Anita lava la tina
Respuesta Esperada: True'''

'''frase=input('Ingrese una frase: ')
frase_corr = ""

i=0
while i<len(frase):
    letra=frase[i]
    if 64 < ord(letra) < 91:
        letra=chr(ord(letra) + 32)
        frase_corr += letra
    elif 96 < ord(letra) < 123:
        frase_corr += letra
    i += 1

i=len(frase_corr) - 1
frase_inv = ""
while i>=0:
    frase_inv += frase_corr[i]
    i -= 1

if frase_corr == frase_inv:
    print(True)
else:
    print(False)'''
    
    
'''🔤5. Contador de palabras (sin trucos)
Cuenta cuántas palabras tiene una frase… pero sin usar .split().
Ejemplo: Hola mundo Python
Respuesta Esperada: 3'''

'''frase=input('Ingrese una frase: ')
i=0
respuesta = 0
while i<len(frase):
    letra=frase[i]
    if letra == ' ':
        respuesta += 1
    i += 1
print(respuesta + 1)''' #Esta bien pero hasta ahi, si poenen varios espacios seguidos o empiezan por espacio esta mal por eso
    
'''frase=input('Ingrese una frase: ')
i=0
respuesta = 0
en_letra=False

while i<len(frase):
    letra=frase[i]
    if letra != ' ':
        if not en_letra:
            respuesta += 1
            en_letra=True
    else:
        en_letra=False
    i += 1
    
print(respuesta)''' #Este esta bien


'''🔐6. Cifrado César básico
Desplaza cada letra de una palabra una cantidad fija de posiciones en el alfabeto (solo
minúsculas).
Ejemplo: hola con desplazamiento 3
Respuesta Esperada: krod'''

'''palabra=input('Ingrese una palabra: ')
despl=input('Ingrese el desplazamiento: ')
i=0
respuesta=''
while i<len(palabra):
    letra=palabra[i]
    if 96<ord(letra)<123:
        letra=chr(ord(letra) + int(despl))
    respuesta += letra
    i += 1
print(respuesta)''' #Mi forma, no esta del todo bien porque nomas sirve si escriben en minuscula


'''palabra = input('Ingrese una palabra: ')
despl = input('Ingrese el desplazamiento: ')
i = 0
respuesta = ''
while i < len(palabra):
    letra = palabra[i]
    if 96 < ord(letra) < 123:                 
        nuevo = ((ord(letra) - 97 + int(despl)) % 26) + 97
        letra = chr(nuevo)
    respuesta += letra
    i += 1
print(respuesta)'''  #Forma del chat

    
'''🟥Nivel 3 – Desafíos creativos
🎨Tu turno de crear con código.
🪜7. Escalera de letras
Muestra el string agregando una letra por línea.
Ejemplo: Hola
Respuesta Esperada:
H
Ho
Hol
Hola'''

'''palabra=input('Ingrese una palabra: ')
resultado=''
i=0

while i<len(palabra):
    letra=palabra[i]
    resultado += letra
    i+= 1
    print(resultado)'''

