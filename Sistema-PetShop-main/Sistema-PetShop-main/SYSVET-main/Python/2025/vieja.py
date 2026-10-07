#Unidad 2
#Desafio 1

#Nivel 1 – Calentamiento
'''Empezamos suave, como estiramiento mental.
1. Invertir un string
Pide un texto al usuario y muéstralo completamente invertido.
Ejemplo: Python
Respuesta Esperada: nohtyP
Escenario 1: use slicing
Escenario 2: Sorprendenos!
Escenario 3: Muestre la cadena invertida solo si la palabra original es mayor a la palabra
invertida.'''

#Escenario 1

'''texto=input('Ingrese un texto: ')
textoinv= texto [ : :-1]
print(textoinv)'''

#Escenario 3

'''texto=input('Ingrese un texto: ')
textoinv= texto [ : :-1]

if texto > textoinv:
    print(textoinv)'''
    
#🗣 2. Contador de vocales
'''Solicita una palabra y cuenta cuántas vocales contiene.
Ejemplo: Murciélago
Respuesta Esperada: 6
Escenario 2: visualice la suma de los dígitos de la cadena'''

'''palabra=input('Ingrese una palabra: ')
p=palabra
i=0
cantvocales=0
while i<len(p):
    if p[i]=='a' or p[i]=='e' or p[i]=='i' or p[i]=='o' or p[i]=='u' or p[i]=='A' or p[i]=='E' or p[i]=='I' or p[i]=='O' or p[i]=='U':
        cantvocales +=  1
    i += 1
print(cantvocales)'''

#3. Mayúsculas alternadas
'''Escenarios:
Escenario 1: frase esta formada solo por letras Mayúsculas o minúsculas
Transforma una frase: letras en posición par → MAYÚSCULA, impares → minúscula.
Ejemplo: hola mundo
Respuesta Esperada: HoLa mUnDo
Escenario 2: la frase puede incluir números y otros símbolos diferentes a las letras
Mayúsculas o minúsculas. Si la frase es correcta haga la transformación, sino muestre un
mensaje
Escenario 3: Cuente la cantidad de caracteres inválidos que están en la frase a analizar'''

#Escenario 1

'''frase=input('Ingrese una frase: ')
i=0
resultado = ""
while i<len(frase):
    letra = frase [i]
    if i % 2 == 0 and ord(letra) >= 97 and ord(letra) <= 122:
        l = chr(ord(letra) - 32)
    elif i % 2 != 0 and ord(letra) >= 65 and ord(letra) <= 90:
        l = chr(ord(letra) + 32)
    else:
        l = letra
        
    
    resultado = resultado + l
    i += 1
print(resultado)'''

#Escenario 2

'''frase=input('Ingrese una frase: ')

#validacion
i=0
valida = True
while i<len(frase):
    letra = frase[i]
    if not(ord(letra) == 32 or (ord(letra) >= 97 and ord(letra) <= 122) or (ord(letra) >= 65 and ord(letra) <= 90 )):
        valida = False
    i += 1
 #Transformacion
 
if valida:
    i=0
    resultado = ""
    while i<len(frase):
        letra = frase [i]
        if i % 2 == 0 and ord(letra) >= 97 and ord(letra) <= 122:
            l = chr(ord(letra) - 32)
        elif i % 2 != 0 and ord(letra) >= 65 and ord(letra) <= 90:
            l = chr(ord(letra) + 32)
        else:
            l = letra
    
        resultado = resultado + l
        i += 1
    print(resultado)
else:
    print('No se pueden usar simbolos que no sean mayus, minus y espacios')'''
    
#Escenario 3

'''frase=input('Ingrese una frase: ')

i = 0
caracinv = 0
while i<len(frase):
    letra = frase[i]
    if not (ord(letra) == 32 or (ord(letra) >= 97 and ord(letra) <= 122) or (ord(letra) >= 65 and ord(letra) <= 90 )):
        caracinv += 1
    i += 1
print('Cantidad de caracteres invalidos: ', caracinv)'''
        
    