#include <libxml/parser.h>
#include <libxml/xinclude.h>
#include <assert.h>
#include <string.h>
static int called,missing;
static xmlParserInputPtr loader(const char *url,const char *id,xmlParserCtxtPtr ctxt){
 (void)url;(void)id;called++;if(!ctxt || !(ctxt->options & XML_PARSE_NONET))missing++;return NULL;
}
int main(void){
 const char *xml="<doc xmlns:xi='http://www.w3.org/2001/XInclude'><xi:include href='http://example.invalid/test' parse='text'><xi:fallback>blocked</xi:fallback></xi:include></doc>";
 xmlInitParser();xmlSetExternalEntityLoader(loader);
 for(int tree=0;tree<2;tree++){
  xmlDocPtr doc=xmlReadMemory(xml,strlen(xml),"test.xml",NULL,XML_PARSE_NONET);assert(doc);
  int ret=tree?xmlXIncludeProcessTree(xmlDocGetRootElement(doc)):xmlXIncludeProcess(doc);assert(ret>=0);xmlFreeDoc(doc);
 }
 assert(called==2);assert(missing==0);xmlCleanupParser();return 0;
}
