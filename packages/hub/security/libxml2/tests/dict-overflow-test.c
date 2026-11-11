#include <assert.h>
#include <stdlib.h>
#include <string.h>
#include "dict.c"
static void *bounded_malloc(size_t n){return n>1048576?NULL:malloc(n);}
static void *bounded_realloc(void *p,size_t n){return n>1048576?NULL:realloc(p,n);}
static char *bounded_strdup(const char *s){size_t n=strlen(s)+1;char *p=bounded_malloc(n);if(p)memcpy(p,s,n);return p;}
int main(void){
 assert(xmlMemSetup(free,bounded_malloc,bounded_realloc,bounded_strdup)==0);
 xmlDictPtr dict=xmlDictCreate();assert(dict);
 const xmlChar *value=xmlDictAddQString(dict,BAD_CAST "p",2147483648U,BAD_CAST "n",2147483648U);
 assert(value==NULL);xmlDictFree(dict);xmlCleanupParser();return 0;
}
